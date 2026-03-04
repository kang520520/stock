import { Telegraf, Markup } from 'telegraf';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

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
    "🎯 核心行情": ["價格", "漲跌", "漲跌幅", "成交量(今日)"],
    "🔍 基礎屬性": ["籌碼力道", "產業", "股本(億)"],
    "💰 籌碼動向": ["外資買賣超", "投信買賣超", "自營商買賣超", "近1日主力買賣超", "近5日主力買賣超", "近20日主力買賣超", "主力連續買賣天數", "主力連續買賣張數"],
    "📊 籌碼集中": ["近5日籌碼集中度", "近10日籌碼集中度", "近20日籌碼集中度", "近60日籌碼集中度"],
    "💎 財報回報": ["近5年平均現金殖利率%"]
};

function fuzzyGet(obj, target) {
    if (!obj) return "";
    if (obj[target] !== undefined) return obj[target];
    const cleanTarget = target.toString().trim().replace(/[ "受“”'']/g, "");
    const realKey = Object.keys(obj).find(k => {
        const cleanK = k.toString().trim().replace(/[ "步“”'']/g, "").replace(/\ufeff/g, "");
        if (cleanTarget === "成交量(今日)" && cleanK === "成交量") return true;
        return cleanK === cleanTarget || cleanK.includes(cleanTarget);
    });
    return realKey ? obj[realKey] : "";
}

const makeKeyboard = (userId, group = null) => {
    const filters = userStates[userId]?.params || [];
    if (!group) {
        const btns = Object.keys(GROUPS).map(g => [Markup.button.callback(g, `menu_${g}`)]);
        const total = filters.length > 0 ? ` (${filters.length}項)` : '';
        btns.push([Markup.button.callback(`🚀 執行選股${total}`, 'run'), Markup.button.callback('🧹 全部清空', 'reset')]);
        return Markup.inlineKeyboard(btns);
    }
    const btns = GROUPS[group].map(p => {
        const count = filters.filter(f => f.key === p).length;
        const display = count > 0 ? ` [${count}項]` : '';
        return [Markup.button.callback(`${p}${display}`, `set_${p}`)];
    });
    btns.push([Markup.button.callback('⬅️ 返回主選單', 'main')]);
    return Markup.inlineKeyboard(btns);
};

// 新增功能：顯示該參數現有的條件並提供刪除按鈕
const makeOperatorKeyboard = (userId, paramName) => {
    const filters = userStates[userId]?.params || [];
    const currentParamFilters = filters.filter(f => f.key === paramName);
    
    const btns = [
        [Markup.button.callback('≥ (大於等於)', `op_${paramName}_>=`), Markup.button.callback('≤ (小於等於)', `op_${paramName}_<=`)],
        [Markup.button.callback('= (等於)', `op_${paramName}_==`), Markup.button.callback('含 (包含)', `op_${paramName}_include`)]
    ];

    // 如果該參數已經有條件，新增刪除按鈕
    currentParamFilters.forEach((f, index) => {
        // 找出這筆資料在原始 params 陣列中的索引
        const realIndex = filters.indexOf(f);
        btns.push([Markup.button.callback(`❌ 刪除：${f.op}${f.val}`, `del_${realIndex}`)]);
    });

    btns.push([Markup.button.callback('⬅️ 返回', 'main')]);
    return Markup.inlineKeyboard(btns);
};

bot.start((ctx) => {
    userStates[ctx.from.id] = { params: [], stage: null, tempOp: null };
    return ctx.reply('歡迎使用大雄 Stock Scanner Pro！\n點擊參數可新增或刪除條件。', makeKeyboard(ctx.from.id));
});

bot.on('callback_query', async (ctx) => {
    const userId = ctx.from.id;
    const data = ctx.callbackQuery.data;
    await ctx.answerCbQuery().catch(() => {});

    if (!userStates[userId]) userStates[userId] = { params: [], stage: null };

    if (data === 'main' || data === 'reset') {
        if (data === 'reset') userStates[userId].params = [];
        await ctx.editMessageText('請選擇篩選分類：', makeKeyboard(userId));
    } else if (data.startsWith('menu_')) {
        const g = data.replace('menu_', '');
        await ctx.editMessageText(`設定 [${g}]：`, makeKeyboard(userId, g));
    } else if (data.startsWith('set_')) {
        const param = data.replace('set_', '');
        await ctx.editMessageText(`設定 [${param}] 的條件：`, makeOperatorKeyboard(userId, param));
    } else if (data.startsWith('del_')) {
        // 刪除特定條件
        const index = parseInt(data.replace('del_', ''));
        const removed = userStates[userId].params.splice(index, 1)[0];
        await ctx.reply(`🗑️ 已刪除：${removed.key} ${removed.op} ${removed.val}`);
        // 刪除後跳回主選單更新狀態
        await ctx.reply('請選擇篩選分類：', makeKeyboard(userId));
    } else if (data.startsWith('op_')) {
        const parts = data.split('_');
        userStates[userId].stage = parts[1];
        userStates[userId].tempOp = parts[2];
        await ctx.reply(`💬 請輸入 [${parts[1]}] 要 ${parts[2]} 的值：`);
    } else if (data === 'run') {
        // ... (保持原有的 run 篩選與顯示邏輯，代碼過長此處略，請使用前一版本 run 區塊) ...
        const loading = await ctx.reply('🔍 正在執行篩選...');
        try {
            const snap = await getDocs(collection(db, "stocks"));
            const allStocks = snap.docs.map(d => d.data());
            const filters = userStates[userId].params;
            const result = allStocks.filter(s => {
                return filters.every(f => {
                    const sv = fuzzyGet(s, f.key);
                    if (f.op === 'include') return String(sv || "").includes(f.val);
                    let v = parseFloat(sv.toString().replace(/[%,]/g, '')) || 0;
                    const volMapping = { "昨天": "成交量1", "前天": "成交量2", "大前天": "成交量3" };
                    const mappedVal = volMapping[f.val] || f.val.toUpperCase();
                    let tv = (["價格", "成交量(今日)"].includes(f.key) && ["5MA", "10MA", "20MA", "60MA", "成交量1", "成交量2", "成交量3"].includes(mappedVal)) 
                             ? parseFloat(fuzzyGet(s, mappedVal)) || 0 : parseFloat(f.val.replace(/[^\d.-]/g, '')) || 0;
                    if (f.op === '>=') return v >= tv;
                    if (f.op === '<=') return v <= tv;
                    if (f.op === '==') return v == tv;
                    return true;
                });
            });
            if (result.length === 0) return await ctx.reply('❌ 無符合條件的股票');
            await ctx.reply(`🎯 結果 (共 ${result.length} 支)\n條件：\n• ${filters.map(f => `${f.key}${f.op}${f.val}`).join('\n• ')}`);
            const chunkSize = 20; 
            for (let i = 0; i < result.length; i += chunkSize) {
                const list = result.slice(i, i + chunkSize).map((s, idx) => {
                    const code = String(fuzzyGet(s, "代碼")).replace(/[ "]/g, "");
                    const name = fuzzyGet(s, "名稱");
                    const price = fuzzyGet(s, "價格");
                    return `${i+idx+1}. [${code}] ${name} - ${price}\n`;
                }).join('\n');
                await ctx.reply(list);
            }
        } catch (e) { await ctx.reply('❌ 錯誤：' + e.message); }
    }
});

bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text.trim();
    const state = userStates[userId];
    if (state?.stage && state?.tempOp) {
        state.params.push({ key: state.stage, op: state.tempOp, val: text });
        state.stage = null; state.tempOp = null;
        return await ctx.reply(`✅ 已新增：${text}`, makeKeyboard(userId));
    }
    if (["選單", "menu", "start"].includes(text.toLowerCase())) {
        userStates[userId] = { params: [], stage: null, tempOp: null };
        return ctx.reply('請選擇分類：', makeKeyboard(userId));
    }
    // ... (搜尋個股邏輯保持不變) ...
});

export default async function (req, res) {
    if (req.method === 'POST') {
        await bot.handleUpdate(req.body);
        res.status(200).send('OK');
    } else { res.status(200).send('Bot Running'); }
}