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

// 主選單介面：新增查看條件功能
const makeKeyboard = (userId, group = null) => {
    const filters = userStates[userId]?.params || [];
    // 將 params 轉換為陣列處理以支援多重準則
    const filterList = Array.isArray(filters) ? filters : Object.entries(filters).map(([k, v]) => ({key: k, op: v.op, val: v.val}));

    if (!group) {
        const btns = Object.keys(GROUPS).map(g => [Markup.button.callback(g, `menu_${g}`)]);
        const total = filterList.length > 0 ? ` (${filterList.length}項)` : '';
        
        // 如果有設定條件，顯示查看按鈕
        if (filterList.length > 0) {
            btns.push([Markup.button.callback('📋 查看 / 刪除個別條件', 'view_filters')]);
        }
        
        btns.push([Markup.button.callback(`🚀 執行選股${total}`, 'run'), Markup.button.callback('🧹 全部清空', 'reset')]);
        return Markup.inlineKeyboard(btns);
    }
    const btns = GROUPS[group].map(p => {
        const count = filterList.filter(f => f.key === p).length;
        const display = count > 0 ? ` [${count}項]` : '';
        return [Markup.button.callback(`${p}${display}`, `set_${p}`)];
    });
    btns.push([Markup.button.callback('⬅️ 返回主選單', 'main')]);
    return Markup.inlineKeyboard(btns);
};

const makeOperatorKeyboard = (paramName) => {
    return Markup.inlineKeyboard([
        [Markup.button.callback('≥ (大於等於)', `op_${paramName}_>=`), Markup.button.callback('≤ (小於等於)', `op_${paramName}_<=`)],
        [Markup.button.callback('= (等於)', `op_${paramName}_==`), Markup.button.callback('含 (包含)', `op_${paramName}_include`)],
        [Markup.button.callback('⬅️ 返回', 'main')]
    ]);
};

// 產生條件清單鍵盤
const makeViewFiltersKeyboard = (userId) => {
    const filters = userStates[userId]?.params || [];
    const filterList = Array.isArray(filters) ? filters : [];
    const btns = filterList.map((f, index) => {
        return [Markup.button.callback(`❌ ${f.key} ${f.op} ${f.val}`, `del_${index}`)];
    });
    btns.push([Markup.button.callback('⬅️ 返回主選單', 'main')]);
    return Markup.inlineKeyboard(btns);
};

bot.start((ctx) => {
    userStates[ctx.from.id] = { params: [], stage: null, tempOp: null };
    return ctx.reply('歡迎使用大雄 Stock Scanner Pro！\n直接輸入「代號」或「名稱」快速查詢，\n或選擇分類進行篩選：', makeKeyboard(ctx.from.id));
});

bot.on('callback_query', async (ctx) => {
    const userId = ctx.from.id;
    const data = ctx.callbackQuery.data;
    await ctx.answerCbQuery().catch(() => {});

    if (!userStates[userId]) userStates[userId] = { params: [], stage: null };
    if (!Array.isArray(userStates[userId].params)) userStates[userId].params = [];

    if (data === 'main' || data === 'reset') {
        if (data === 'reset') userStates[userId].params = [];
        await ctx.editMessageText('請選擇分類進行條件篩選：', makeKeyboard(userId));
    } 
    else if (data === 'view_filters') {
        await ctx.editMessageText('目前設定的條件如下（點擊 ❌ 可個別刪除）：', makeViewFiltersKeyboard(userId));
    }
    else if (data.startsWith('menu_')) {
        const g = data.replace('menu_', '');
        await ctx.editMessageText(`設定 [${g}]，請點擊參數：`, makeKeyboard(userId, g));
    } else if (data.startsWith('set_')) {
        const param = data.replace('set_', '');
        await ctx.editMessageText(`請選擇 [${param}] 的條件：`, makeOperatorKeyboard(param));
    } else if (data.startsWith('del_')) {
        const index = parseInt(data.replace('del_', ''));
        const removed = userStates[userId].params.splice(index, 1)[0];
        await ctx.reply(`🗑️ 已刪除：${removed.key} ${removed.op} ${removed.val}`);
        if (userStates[userId].params.length > 0) {
            await ctx.editMessageText('剩餘條件如下：', makeViewFiltersKeyboard(userId)).catch(() => {});
        } else {
            await ctx.editMessageText('條件已全部清空。', makeKeyboard(userId)).catch(() => {});
        }
    } else if (data.startsWith('op_')) {
        const parts = data.split('_');
        userStates[userId].stage = parts[1];
        userStates[userId].tempOp = parts[2];
        await ctx.reply(`💬 請輸入 [${parts[1]}] 要 ${parts[2]} 的值：\n\n` +
        `💡 支援格式：\n` +
        `• 價格支援均線：5MA, 10MA, 20MA, 60MA\n` +
        `• 成交量：昨天, 前天, 大前天\n` +
        `• 籌碼力道：買壓增加、買壓減緩、賣壓增加、賣壓減緩 (搭配「含」)\n` +
        `• 產業：請輸入名稱 (搭配「含」)\n` +
        `• 數值：直接輸入純數字`);
    } else if (data === 'run') {
        const loading = await ctx.reply('🔍 正在連線 Firebase 過濾資料...');
        try {
            const snap = await getDocs(collection(db, "stocks"));
            const allStocks = snap.docs.map(d => d.data());
            const filters = userStates[userId].params;

            const result = allStocks.filter(s => {
                return filters.every(f => {
                    const sv = fuzzyGet(s, f.key);
                    if (f.op === 'include') return String(sv || "").includes(f.val);
                    
                    let v = parseFloat(sv.toString().replace(/[%,]/g, '')) || 0;
                    let tv;
                    const volMapping = { "昨天": "成交量1", "前天": "成交量2", "大前天": "成交量3" };
                    const inputVal = f.val.toString().trim();
                    const mappedVal = volMapping[inputVal] || inputVal.toUpperCase();
                    
                    if (["價格", "成交量(今日)"].includes(f.key) && ["5MA", "10MA", "20MA", "60MA", "成交量1", "成交量2", "成交量3"].includes(mappedVal)) {
                        tv = parseFloat(fuzzyGet(s, mappedVal)) || 0;
                    } else {
                        tv = parseFloat(inputVal.replace(/[^\d.-]/g, '')) || 0;
                    }

                    if (f.op === '>=') return v >= tv;
                    if (f.op === '<=') return v <= tv;
                    if (f.op === '==') return v == tv;
                    return true;
                });
            });

            if (result.length === 0) {
                await ctx.reply('❌ 無符合股票');
                return;
            }

            let header = `🎯 篩選結果 (共 ${result.length} 支)\n`;
            header += `條件: ${filters.map(f => `${f.key}${f.op}${f.val}`).join(', ') || '無'}`;
            await ctx.reply(header);

            const chunkSize = 20; 
            for (let i = 0; i < result.length; i += chunkSize) {
                const chunk = result.slice(i, i + chunkSize);
                const list = chunk.map((s, idx) => {
                    const realIdx = i + idx + 1;
                    const code = String(fuzzyGet(s, "代碼")).replace(/[ "]/g, "");
                    const name = fuzzyGet(s, "名稱");
                    const price = fuzzyGet(s, "價格");
                    const changeVal = parseFloat(fuzzyGet(s, "漲跌").toString().replace('%', '')) || 0;
                    const pctVal = parseFloat(fuzzyGet(s, "漲跌幅").toString().replace('%', '')) || 0;

                    const getChangeStatus = (val) => (val > 0 ? "上漲" : val < 0 ? "下跌" : "平盤");
                    const getPctStatus = (val) => (val > 0 ? "漲幅" : val < 0 ? "跌幅" : "平盤");

                    const absChange = Math.abs(changeVal).toFixed(2);
                    const absPct = Math.abs(pctVal).toFixed(2) + "%";
                    const industry = fuzzyGet(s, "產業") || "未分類";

                    return `${realIdx}. [${code}] ${name}\n價格: ${price} (${getChangeStatus(changeVal)}${absChange} / ${getPctStatus(pctVal)}${absPct})\n產業: ${industry}\n`;
                }).join('\n');

                await ctx.reply(list);
                await new Promise(r => setTimeout(r, 500));
            }
            await ctx.reply(`🔗 [網頁版清單](https://stock-eosin-kappa.vercel.app/)`);
        } catch (e) {
            await ctx.reply('❌ 錯誤：' + e.message);
        }
    }
});

bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text.trim();
    const state = userStates[userId];

    if (state?.stage && state?.tempOp) {
        if (!Array.isArray(state.params)) state.params = [];
        state.params.push({ key: state.stage, op: state.tempOp, val: text });
        state.stage = null; state.tempOp = null;
        return await ctx.reply(`✅ 已新增：${text}`, makeKeyboard(userId));
    }

    if (["選單", "menu", "start", "篩選"].includes(text.toLowerCase())) {
        userStates[userId] = { params: [], stage: null, tempOp: null };
        return ctx.reply('請選擇分類進行篩選：', makeKeyboard(userId));
    }

    const loading = await ctx.reply(`🔍 正在查詢「${text}」...`);
    try {
        const snap = await getDocs(collection(db, "stocks"));
        const searchResult = snap.docs.map(d => d.data()).filter(s => {
            const code = String(fuzzyGet(s, "代碼")).replace(/[ "]/g, "");
            const name = String(fuzzyGet(s, "名稱"));
            return code.includes(text) || name.includes(text);
        });

        if (searchResult.length === 0) {
            return await ctx.reply(`❌ 找不到與「${text}」相關的股票。`);
        }

        const list = searchResult.slice(0, 10).map((s, idx) => {
            const code = String(fuzzyGet(s, "代碼")).replace(/[ "]/g, "");
            const name = fuzzyGet(s, "名稱");
            const price = fuzzyGet(s, "價格");
            const cv = parseFloat(fuzzyGet(s, "漲跌").toString().replace('%', '')) || 0;
            const pv = parseFloat(fuzzyGet(s, "漲跌幅").toString().replace('%', '')) || 0;
            const getChangeStatus = (val) => (val > 0 ? "上漲" : val < 0 ? "下跌" : "平盤");
            const getPctStatus = (val) => (val > 0 ? "漲幅" : val < 0 ? "跌幅" : "平盤");
            return `${idx + 1}. [${code}] ${name}\n價格: ${price} (${getChangeStatus(cv)}${Math.abs(cv).toFixed(2)} / ${getPctStatus(pv)}${Math.abs(pv).toFixed(2)}%)\n產業: ${fuzzyGet(s, "產業") || "未分類"}\n`;
        }).join('\n');

        await ctx.reply(`🎯 查詢結果 (顯示前 10 筆)：\n\n${list}`);
    } catch (e) {
        await ctx.reply('❌ 查詢出錯：' + e.message);
    }
});

export default async function (req, res) {
    if (req.method === 'POST') {
        await bot.handleUpdate(req.body);
        res.status(200).send('OK');
    } else {
        res.status(200).send('Bot Running');
    }
}