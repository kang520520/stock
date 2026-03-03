import { Telegraf, Markup } from 'telegraf';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

// 1. Firebase 配置
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

// 使用者狀態追蹤
let userStates = {}; 

const GROUPS = {
    "🎯 核心行情": ["價格", "漲跌", "漲跌幅", "成交量(今日)"],
    "🔍 基礎屬性": ["籌碼力道", "產業", "股本(億)"],
    "💰 籌碼動向": ["外資買賣超", "投信買賣超", "自營商買賣超", "近1日主力買賣超", "近5日主力買賣超", "近20日主力買賣超", "主力連續買賣天數", "主力連續買賣張數"],
    "📊 籌碼集中": ["近5日籌碼集中度", "近10日籌碼集中度", "近20日籌碼集中度", "近60日籌碼集中度"],
    "💎 財報回報": ["近5年平均現金殖利率%"]
};

// 模糊比對函式
function fuzzyGet(obj, target) {
    if (!obj) return "";
    const cleanTarget = target.toString().trim().replace(/[ "“”'']/g, "");
    const realKey = Object.keys(obj).find(k => {
        const cleanK = k.toString().trim().replace(/[ "步“”'']/g, "").replace(/\ufeff/g, "");
        if (cleanTarget === "成交量(今日)" && (cleanK === "成交量" || cleanK === "成交量今日")) return true;
        return cleanK === cleanTarget || cleanK.includes(cleanTarget);
    });
    return realKey ? obj[realKey] : "";
}

// 產生選單
const makeKeyboard = (userId, group = null) => {
    const params = userStates[userId]?.params || {};
    if (!group) {
        const btns = Object.keys(GROUPS).map(g => [Markup.button.callback(g, `menu_${g}`)]);
        btns.push([Markup.button.callback('🚀 執行選股', 'run'), Markup.button.callback('🧹 清空重置', 'reset')]);
        return Markup.inlineKeyboard(btns);
    }
    const btns = GROUPS[group].map(p => {
        const val = params[p] ? ` (${params[p]})` : '';
        return [Markup.button.callback(`${p}${val}`, `set_${p}`)];
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

    // 💡 重要：立刻回應 Telegram 消除按鈕轉圈圈狀態
    await ctx.answerCbQuery().catch(() => {}); 

    if (!userStates[userId]) userStates[userId] = { params: {}, stage: null };

    if (data === 'main' || data === 'reset') {
        if (data === 'reset') userStates[userId].params = {};
        await ctx.editMessageText('請選擇分類設定參數：', makeKeyboard(userId)).catch(() => {});
    } 
    else if (data.startsWith('menu_')) {
        const g = data.replace('menu_', '');
        await ctx.editMessageText(`正在設定 [${g}]，點擊參數設定門檻：`, makeKeyboard(userId, g)).catch(() => {});
    } 
    else if (data.startsWith('set_')) {
        const target = data.replace('set_', '');
        userStates[userId].stage = target;
        await ctx.reply(`請輸入 [${target}] 的門檻值 (僅輸入數字)：`);
    } 
    else if (data === 'run') {
        const statusMsg = await ctx.reply('🔍 正在連線 Firebase 執行過濾...');
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

            const list = result.slice(0, 15).map(s => {
                const code = String(fuzzyGet(s, "代碼")).replace(/[ "]/g, "");
                const name = fuzzyGet(s, "名稱");
                const price = fuzzyGet(s, "價格");
                return `• ${code} ${name} (現價: ${price})`;
            }).join('\n');

            let report = `🎯 篩選結果 (共 ${result.length} 支)\n`;
            report += `條件: ${Object.keys(filters).length > 0 ? Object.entries(filters).map(([k, v]) => `${k}>${v}`).join(', ') : '無'}\n\n`;
            report += list || '❌ 目前無符合條件的股票';
            report += `\n\n網頁版: https://stock-eosin-kappa.vercel.app/`;

            await ctx.reply(report);
        } catch (e) {
            console.error('Run Error:', e);
            await ctx.reply('❌ 執行失敗：' + e.message);
        }
    }
});

bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    if (userStates[userId]?.stage) {
        const target = userStates[userId].stage;
        userStates[userId].params[target] = ctx.message.text;
        userStates[userId].stage = null;
        await ctx.reply(`✅ 已記錄 ${target}：${ctx.message.text}`, makeKeyboard(userId));
    }
});

// Vercel Entry Point
export default async function handler(req, res) {
    try {
        if (req.method === 'POST') {
            await bot.handleUpdate(req.body);
            return res.status(200).send('OK');
        }
        return res.status(200).send('Bot Running');
    } catch (err) {
        console.error('Global Error:', err);
        return res.status(200).send('OK'); 
    }
}