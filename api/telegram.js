import { Telegraf, Markup } from 'telegraf';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

// 1. Firebase 配置 (對應你的專案)
const firebaseConfig = {
    apiKey: "AIzaSyDnhwU3IZ3ScrViOLEgOMymXxDK2F0b0_Y",
    authDomain: "stock-9b4fe.firebaseapp.com",
    projectId: "stock-9b4fe",
    storageBucket: "stock-9b4fe.firebasestorage.app",
    messagingSenderId: "559837110738",
    appId: "1:559837110738:web:a1bc107a7ed01a3e81a80b"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const bot = new Telegraf(process.env.TG_TOKEN);

// 暫存使用者設定 (Serverless 環境下僅在執行期間有效)
let userStates = {}; 

// 2. 選股參數分類
const GROUPS = {
    "🎯 核心行情": ["價格", "漲跌幅", "成交量(今日)"],
    "💰 籌碼動向": ["外資買賣超", "投信買賣超", "主力連續買賣天數"],
    "📊 籌碼集中": ["近5日籌碼集中度", "近20日籌碼集中度"],
    "💎 財報回報": ["近5年平均現金殖利率%"]
};

// 輔助函式：模擬網頁版的 fuzzyGet
function fuzzyGet(obj, target) {
    if (!obj) return "";
    const cleanTarget = target.toString().trim().replace(/[ "“”'']/g, "");
    const realKey = Object.keys(obj).find(k => {
        const cleanK = k.toString().trim().replace(/[ "步“”'']/g, "").replace(/\ufeff/g, "");
        if (cleanTarget === "成交量(今日)" && cleanK === "成交量") return true;
        return cleanK === cleanTarget || cleanK.includes(cleanTarget);
    });
    return realKey ? obj[realKey] : "";
}

// 產生選單按鈕
const makeKeyboard = (userId, group = null) => {
    const params = userStates[userId]?.params || {};
    if (!group) {
        const btns = Object.keys(GROUPS).map(g => [Markup.button.callback(g, `menu_${g}`)]);
        btns.push([Markup.button.callback('🚀 執行選股', 'run'), Markup.button.callback('🧹 清空重置', 'reset')]);
        return Markup.inlineKeyboard(btns);
    }
    const btns = GROUPS[group].map(p => {
        const currentVal = params[p] ? `(已設: ${params[p]})` : '';
        return [Markup.button.callback(`${p} ${currentVal}`, `set_${p}`)];
    });
    btns.push([Markup.button.callback('⬅️ 返回主選單', 'main')]);
    return Markup.inlineKeyboard(btns);
};

// --- 指令處理 ---
bot.start((ctx) => {
    const userId = ctx.from.id;
    userStates[userId] = { params: {}, stage: null };
    return ctx.reply('歡迎使用大雄 Stock Scanner Pro！\n請選擇分類設定參數：', makeKeyboard(userId));
});

bot.on('callback_query', async (ctx) => {
    const userId = ctx.from.id;
    const data = ctx.callbackQuery.data;
    if (!userStates[userId]) userStates[userId] = { params: {}, stage: null };

    if (data === 'main' || data === 'reset') {
        if (data === 'reset') userStates[userId].params = {};
        await ctx.editMessageText('請選擇分類設定參數：', makeKeyboard(userId));
    } 
    else if (data.startsWith('menu_')) {
        const g = data.replace('menu_', '');
        await ctx.editMessageText(`正在設定 [${g}]，點擊參數設定門檻：`, makeKeyboard(userId, g));
    } 
    else if (data.startsWith('set_')) {
        const target = data.replace('set_', '');
        userStates[userId].stage = target;
        await ctx.reply(`請輸入 [${target}] 的門檻值 (僅輸入數字，例如 500)：`);
    } 
    else if (data === 'run') {
        await ctx.reply('🔍 正在連線 Firebase 執行過濾，請稍候...');
        try {
            const snap = await getDocs(collection(db, "stocks"));
            const allStocks = snap.docs.map(d => d.data());
            const filters = userStates[userId].params;

            const result = allStocks.filter(s => {
                return Object.keys(filters).every(key => {
                    const sv = fuzzyGet(s, key);
                    const v = parseFloat(sv.toString().replace('%','')) || 0;
                    const tv = parseFloat(filters[key]) || 0;
                    return v >= tv; 
                });
            });

            // 建立結果清單 (純文字格式，避免 Markdown 報錯)
            const list = result.slice(0, 15).map(s => {
                const code = String(fuzzyGet(s, "代碼")).replace(/[ "]/g, "");
                const name = fuzzyGet(s, "名稱");
                const price = fuzzyGet(s, "價格");
                return `• ${code} ${name} (現價: ${price})`;
            }).join('\n');

            let report = `🎯 篩選結果 (共 ${result.length} 支)\n`;
            report += `條件: ${Object.keys(filters).length > 0 ? Object.entries(filters).map(([k, v]) => `${k}>${v}`).join(', ') : '無'}\n\n`;
            report += list || '❌ 目前無符合條件的股票';
            report += `\n\n網頁版清單: https://stock-eosin-kappa.vercel.app/`;

            await ctx.reply(report); 
        } catch (e) {
            console.error('Firebase Error:', e);
            await ctx.reply('❌ 執行選股時發生錯誤，請檢查資料庫連線');
        }
    }
});

bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    if (userStates[userId]?.stage) {
        const target = userStates[userId].stage;
        userStates[userId].params[target] = ctx.message.text;
        userStates[userId].stage = null;
        await ctx.reply(`✅ 已記錄 ${target} 門檻：${ctx.message.text}`, makeKeyboard(userId));
    }
});

// 3. Vercel 必須匯出的入口函式
export default async function handler(req, res) {
    try {
        if (req.method === 'POST') {
            await bot.handleUpdate(req.body);
            res.status(200).send('OK');
        } else {
            res.status(200).send('Telegram Bot 服務運行中 (GET)');
        }
    } catch (err) {
        console.error('Vercel Handler Error:', err);
        res.status(500).send('Internal Server Error');
    }
}