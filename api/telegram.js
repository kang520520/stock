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

let userStates = {}; 

// 完全同步你網頁版的分類
const GROUPS = {
    "🎯 核心行情": ["價格", "漲跌", "漲跌幅", "成交量(今日)"],
    "🔍 基礎屬性": ["籌碼力道", "產業", "股本(億)"],
    "💰 籌碼動向": ["外資買賣超", "投信買賣超", "自營商買賣超", "主力連續買賣天數", "主力連續買賣張數"],
    "📊 籌碼集中": ["近5日籌碼集中度", "近10日籌碼集中度", "近20日籌碼集中度", "近60日籌碼集中度"],
    "💎 財報回報": ["近5年平均現金殖利率%"]
};

// 移植你網頁版的 fuzzyGet 邏輯
function fuzzyGet(obj, target) {
    if (!obj) return "";
    if (obj[target] !== undefined) return obj[target];
    const cleanTarget = target.toString().trim().replace(/[ "“”'']/g, "");
    const realKey = Object.keys(obj).find(k => {
        const cleanK = k.toString().trim().replace(/[ "步“”'']/g, "").replace(/\ufeff/g, "");
        if (cleanTarget === "成交量(今日)" && cleanK === "成交量") return true;
        return cleanK === cleanTarget || cleanK.includes(cleanTarget);
    });
    return realKey ? obj[realKey] : "";
}

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

bot.start((ctx) => {
    userStates[ctx.from.id] = { params: {}, stage: null };
    return ctx.reply('歡迎使用大雄 Stock Scanner Pro (TG版)！\n請設定篩選門檻：', makeKeyboard(ctx.from.id));
});

bot.on('callback_query', async (ctx) => {
    const userId = ctx.from.id;
    const data = ctx.callbackQuery.data;
    await ctx.answerCbQuery().catch(() => {}); 

    if (!userStates[userId]) userStates[userId] = { params: {}, stage: null };

    if (data === 'main' || data === 'reset') {
        if (data === 'reset') userStates[userId].params = {};
        await ctx.editMessageText('請選擇分類設定參數：', makeKeyboard(userId));
    } else if (data.startsWith('menu_')) {
        const g = data.replace('menu_', '');
        await ctx.editMessageText(`設定 [${g}]，請點擊參數：\n(支援輸入中文數字，如: 500張)`, makeKeyboard(userId, g));
    } else if (data.startsWith('set_')) {
        userStates[userId].stage = data.replace('set_', '');
        let hint = "請輸入數值";
        if (userStates[userId].stage === "價格") hint = "請輸入數字或 MA (如: 20MA)";
        if (userStates[userId].stage === "成交量(今日)") hint = "請輸入數字或歷史量 (如: 昨天)";
        await ctx.reply(`${hint}：`);
    } else if (data === 'run') {
        await ctx.reply('🔍 正在連線 Firebase 執行過濾...');
        try {
            const snap = await getDocs(collection(db, "stocks"));
            const allStocks = snap.docs.map(d => d.data());
            const filters = userStates[userId].params;

            const result = allStocks.filter(s => {
                return Object.keys(filters).every(key => {
                    const inputVal = filters[key].toString().trim();
                    if (inputVal === "") return true;

                    const sv = fuzzyGet(s, key);
                    // 1. 處理資料庫數值清理
                    let v = parseFloat(sv.toString().replace(/[%,]/g, '')) || 0;
                    let tv;

                    // 2. 移植網頁版特殊對應邏輯 (MA 與 歷史量)
                    const volMapping = { "昨天": "成交量1", "前天": "成交量2", "大前天": "成交量3" };
                    const mappedVal = volMapping[inputVal] || inputVal;

                    if (["價格", "成交量(今日)"].includes(key) && 
                        ["5MA", "10MA", "20MA", "60MA", "成交量1", "成交量2", "成交量3", "昨天", "前天", "大前天"].includes(mappedVal)) {
                        tv = parseFloat(fuzzyGet(s, mappedVal)) || 0;
                    } else {
                        // 3. 強化：自動過濾掉中英文，只留數字
                        const cleanInput = inputVal.replace(/[^\d.-]/g, '');
                        tv = parseFloat(cleanInput) || 0;
                    }
                    
                    // 預設採用網頁版的 >= 邏輯
                    return v >= tv; 
                });
            });

            const list = result.slice(0, 15).map(s => {
                const code = String(fuzzyGet(s, "代碼")).replace(/[ "]/g, "");
                const name = fuzzyGet(s, "名稱");
                const price = fuzzyGet(s, "價格");
                const change = fuzzyGet(s, "漲跌幅");
                return `• \`${code}\` ${name} (${price}) [${change}]`;
            }).join('\n');

            let report = `🎯 篩選結果 (共 ${result.length} 支)\n`;
            report += `條件: ${Object.entries(filters).map(([k, v]) => `${k}>${v}`).join(', ') || '無'}\n\n`;
            report += list || '❌ 無符合股票';
            report += `\n\n🔗 [點我回官網查看完整列表](https://stock-eosin-kappa.vercel.app/)`;

            await ctx.reply(report);
        } catch (e) {
            await ctx.reply('❌ 錯誤：' + e.message);
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

export default async function (req, res) {
    if (req.method === 'POST') {
        await bot.handleUpdate(req.body);
        res.status(200).send('OK');
    } else {
        res.status(200).send('Running');
    }
}