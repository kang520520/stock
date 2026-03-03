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

let userStates = {}; 

const GROUPS = {
    "🎯 核心行情": ["價格", "漲跌幅", "成交量(今日)"],
    "💰 籌碼動向": ["外資買賣超", "投信買賣超", "主力連續買賣天數"],
    "📊 籌碼集中": ["近5日籌碼集中度", "近20日籌碼集中度"],
    "💎 財報回報": ["近5年平均現金殖利率%"]
};

// 輔助函式：處理 Telegram 特殊字元轉義
const escapeMarkdown = (text) => {
    return String(text).replace(/[_*\[\]()~`>#+\-=|{}.!]/g, '\\$&');
};

function fuzzyGet(obj, target) {
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
    const btns = GROUPS[group].map(p => [Markup.button.callback(`${p}: ${params[p] || '未設'}`, `set_${p}`)]);
    btns.push([Markup.button.callback('⬅️ 返回主選單', 'main')]);
    return Markup.inlineKeyboard(btns);
};

bot.start((ctx) => ctx.reply('歡迎使用大雄 Stock Scanner Pro！\n請選擇分類設定參數：', makeKeyboard(ctx.from.id)));

bot.on('callback_query', async (ctx) => {
    const userId = ctx.from.id;
    const data = ctx.callbackQuery.data;
    if (!userStates[userId]) userStates[userId] = { params: {}, stage: null };

    if (data === 'main' || data === 'reset') {
        if (data === 'reset') userStates[userId].params = {};
        await ctx.editMessageText('請選擇分類設定參數：', makeKeyboard(userId));
    } else if (data.startsWith('menu_')) {
        const g = data.replace('menu_', '');
        await ctx.editMessageText(`正在設定 [${g}]，點擊參數設定門檻：`, makeKeyboard(userId, g));
    } else if (data.startsWith('set_')) {
        userStates[userId].stage = data.replace('set_', '');
        await ctx.reply(`請輸入 [${userStates[userId].stage}] 的門檻值 (僅數字)：`);
    } else if (data === 'run') {
        await ctx.reply('🔍 正在連線 Firebase 執行過濾...');
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

            // 處理結果清單並進行轉義
            const list = result.slice(0, 10).map(s => {
                const code = escapeMarkdown(String(fuzzyGet(s, "代碼")).replace(/[ "]/g, ""));
                const name = escapeMarkdown(fuzzyGet(s, "名稱"));
                const price = escapeMarkdown(fuzzyGet(s, "價格"));
                return `• \`${code}\` ${name} \\(${price}\\)`;
            }).join('\n');

            const filterDesc = Object.keys(filters).length > 0 
                ? escapeMarkdown(Object.entries(filters).map(([k, v]) => `${k}>${v}`).join(', ')) 
                : '無';

            const report = `🎯 *篩選結果 (前10名)*\n條件: ${filterDesc}\n\n${list || '❌ 無符合股票'}\n\n[🔗 回官網看完整列表](https://stock-eosin-kappa.vercel.app/)`;

            await ctx.replyWithMarkdownV2(report);
        } catch (e) {
            console.error(e);
            await ctx.reply('❌ 發生錯誤，請稍後再試');
        }
    }
});

bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    if (userStates[userId]?.stage) {
        userStates[userId].params[userStates[userId].stage] = ctx.message.text;
        userStates[userId].stage = null;
        await ctx.reply(`✅ 已記錄門檻：${ctx.message.text}`, makeKeyboard(userId));
    }
});

export default async function handler(req, res) {
    try {
        if (req.method === 'POST') {
            await bot.handleUpdate(req.body);
            res.status(200).send('OK');
        } else {
            res.status(200).send('Server is running (Method: ' + req.method + ')');
        }
    } catch (err) {
        console.error(err);
        res.status(500).send('Error');
    }
}