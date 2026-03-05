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

// 快速選項定義
const QUICK_OPTIONS = {
    "價格": ["5MA", "10MA", "20MA", "60MA"],
    "成交量(今日)": ["昨天", "前天", "大前天"],
    "籌碼力道": ["買壓增加", "買壓減緩", "賣壓增加", "賣壓減緩"],
    "產業": ["半導體", "電子零組件", "光電", "電腦及週邊", "通信網路", "金融保險", "航運", "鋼鐵", "塑膠", "生技醫療"]
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

// 產生多選鍵盤介面
const makeMultiSelectKeyboard = (userId, param) => {
    const selected = userStates[userId].tempSelected || [];
    const options = QUICK_OPTIONS[param] || [];
    
    const btns = options.map(opt => {
        const isSel = selected.includes(opt);
        return [Markup.button.callback(`${isSel ? '✅ ' : ''}${opt}`, `toggle_${opt}`)];
    });
    
    btns.push([Markup.button.callback('✨ 確認送出所選', 'confirm_multi')]);
    // 籌碼力道不需要手動輸入，其他保留
    if (param !== "籌碼力道") {
        btns.push([Markup.button.callback('⌨️ 手動輸入值', 'manual_input')]);
    }
    btns.push([Markup.button.callback('⬅️ 返回', 'main')]);
    return Markup.inlineKeyboard(btns);
};

const makeKeyboard = (userId, group = null) => {
    const filters = userStates[userId]?.params || [];
    const filterList = Array.isArray(filters) ? filters : [];

    if (!group) {
        const btns = Object.keys(GROUPS).map(g => [Markup.button.callback(g, `menu_${g}`)]);
        const total = filterList.length > 0 ? ` (${filterList.length}項)` : '';
        if (filterList.length > 0) {
            btns.push([Markup.button.callback('📋 查看 / 刪除個別條件', 'view_filters')]);
        }
        btns.push([Markup.button.callback(`🚀 執行選股${total}`, 'run'), Markup.button.callback('🧹 全部清空', 'reset')]);
        return Markup.inlineKeyboard(btns);
    }
    const btns = GROUPS[group].map(p => {
        const count = filterList.filter(f => f.key === p).length;
        return [Markup.button.callback(`${p}${count > 0 ? ` [${count}項]` : ''}`, `set_${p}`)];
    });
    btns.push([Markup.button.callback('⬅️ 返回主選單', 'main')]);
    return Markup.inlineKeyboard(btns);
};

const makeViewFiltersKeyboard = (userId) => {
    const filters = userStates[userId]?.params || [];
    const btns = filters.map((f, index) => [Markup.button.callback(`❌ ${f.key} ${f.op} ${f.val}`, `del_${index}`)]);
    btns.push([Markup.button.callback('⬅️ 返回主選單', 'main')]);
    return Markup.inlineKeyboard(btns);
};

bot.start((ctx) => {
    userStates[ctx.from.id] = { params: [], stage: null, tempOp: null, tempSelected: [] };
    return ctx.reply('歡迎使用大雄 Stock Scanner Pro！\n個股查詢請輸入 P + 代號 (例：P2330)\n或點選下方按鈕開始篩選：', makeKeyboard(ctx.from.id));
});

bot.on('callback_query', async (ctx) => {
    const userId = ctx.from.id;
    const data = ctx.callbackQuery.data;
    if (!userStates[userId]) userStates[userId] = { params: [], stage: null, tempSelected: [] };
    const state = userStates[userId];
    await ctx.answerCbQuery().catch(() => {});

    try {
        if (data === 'main' || data === 'reset') {
            if (data === 'reset') state.params = [];
            state.stage = null; state.tempSelected = [];
            await ctx.editMessageText('請選擇篩選分類：', makeKeyboard(userId));
        } else if (data === 'view_filters') {
            await ctx.editMessageText('點擊 ❌ 可個別刪除條件：', makeViewFiltersKeyboard(userId));
        } else if (data.startsWith('menu_')) {
            const g = data.replace('menu_', '');
            await ctx.editMessageText(`設定 [${g}]：`, makeKeyboard(userId, g));
        } else if (data.startsWith('set_')) {
            const param = data.replace('set_', '');
            state.stage = param;
            state.tempSelected = [];
            if (["籌碼力道", "產業"].includes(param)) {
                state.tempOp = "include";
                await ctx.editMessageText(`請多選 [${param}] (可點選多個再按確認)：`, makeMultiSelectKeyboard(userId, param));
            } else {
                await ctx.editMessageText(`請選擇 [${param}] 的判斷符號：`, Markup.inlineKeyboard([
                    [Markup.button.callback('≥', `op_${param}_>=`), Markup.button.callback('≤', `op_${param}_<=`)],
                    [Markup.button.callback('=', `op_${param}_==`), Markup.button.callback('含', `op_${param}_include`)],
                    [Markup.button.callback('⬅️ 返回', 'main')]
                ]));
            }
        } else if (data.startsWith('op_')) {
            const parts = data.split('_');
            state.stage = parts[1];
            state.tempOp = parts[2];
            if (QUICK_OPTIONS[state.stage]) {
                await ctx.editMessageText(`請選擇 [${state.stage}] 的快捷選項：`, makeMultiSelectKeyboard(userId, state.stage));
            } else {
                await ctx.reply(`💬 請輸入 [${state.stage}] 的數值：`);
            }
        } else if (data.startsWith('toggle_')) {
            const opt = data.replace('toggle_', '');
            if (!state.tempSelected) state.tempSelected = [];
            if (state.tempSelected.includes(opt)) {
                state.tempSelected = state.tempSelected.filter(i => i !== opt);
            } else {
                state.tempSelected.push(opt);
            }
            await ctx.editMessageReplyMarkup(makeMultiSelectKeyboard(userId, state.stage).reply_markup);
        } else if (data === 'confirm_multi') {
            if (state.tempSelected.length === 0) return await ctx.reply('⚠️ 請至少勾選一個選項！');
            state.tempSelected.forEach(v => state.params.push({ key: state.stage, op: state.tempOp, val: v }));
            const summary = state.tempSelected.join(', ');
            state.tempSelected = []; state.stage = null;
            await ctx.reply(`✅ 已成功新增：${summary}`, makeKeyboard(userId));
        } else if (data === 'manual_input') {
            await ctx.reply(`💬 請輸入 [${state.stage}] 的自定義數值或文字：`);
        } else if (data.startsWith('del_')) {
            state.params.splice(parseInt(data.replace('del_', '')), 1);
            if (state.params.length > 0) {
                await ctx.editMessageText('剩餘條件：', makeViewFiltersKeyboard(userId));
            } else {
                await ctx.editMessageText('條件已清空。', makeKeyboard(userId));
            }
        } else if (data === 'run') {
            // 💡 新增：執行前檢查條件是否為空
            if (state.params.length === 0) {
                return await ctx.reply('⚠️ 您目前尚未設定任何條件！\n請先選擇分類並設定門檻後再執行選股。');
            }

            await ctx.reply('🔍 正在從 Firebase 過濾資料，請稍候...');
            const snap = await getDocs(collection(db, "stocks"));
            const allStocks = snap.docs.map(d => d.data());
            const filters = state.params;

            const result = allStocks.filter(s => {
                return filters.every(f => {
                    const sv = fuzzyGet(s, f.key);
                    if (f.op === 'include') return String(sv || "").includes(f.val);
                    let v = parseFloat(sv.toString().replace(/[%,]/g, '')) || 0;
                    const volMapping = { "昨天": "成交量1", "前天": "成交量2", "大前天": "成交量3" };
                    const inputVal = f.val.toString().trim();
                    const mappedVal = volMapping[inputVal] || inputVal.toUpperCase();
                    let tv = (["價格", "成交量(今日)"].includes(f.key) && ["5MA", "10MA", "20MA", "60MA", "成交量1", "成交量2", "成交量3"].includes(mappedVal)) 
                             ? parseFloat(fuzzyGet(s, mappedVal)) || 0 : parseFloat(inputVal.replace(/[^\d.-]/g, '')) || 0;
                    if (f.op === '>=') return v >= tv;
                    if (f.op === '<=') return v <= tv;
                    if (f.op === '==') return v == tv;
                    return true;
                });
            });

            if (result.length === 0) return await ctx.reply('❌ 找不到符合條件的股票。');
            await ctx.reply(`🎯 找到 ${result.length} 支股票\n條件: ${filters.map(f => `${f.key}${f.op}${f.val}`).join(', ')}`);
            
            for (let i = 0; i < result.length; i += 20) {
                const list = result.slice(i, i + 20).map((s, idx) => {
                    const code = String(fuzzyGet(s, "代碼")).replace(/[ "]/g, "");
                    const pv = parseFloat(fuzzyGet(s, "漲跌幅").toString().replace('%', '')) || 0;
                    return `${i+idx+1}. [${code}] ${fuzzyGet(s, "名稱")} 價:${fuzzyGet(s, "價格")} (${pv.toFixed(2)}%)\n`;
                }).join('\n');
                await ctx.reply(list);
                await new Promise(r => setTimeout(r, 500));
            }
        }
    } catch (e) { console.error(e); }
});

bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text.trim();
    if (!userStates[userId]) userStates[userId] = { params: [], stage: null, tempSelected: [] };
    const state = userStates[userId];

    // 分支 1：正在輸入條件值
    if (state.stage) {
        state.params.push({ key: state.stage, op: state.tempOp, val: text });
        state.stage = null; state.tempOp = null;
        return await ctx.reply(`✅ 已新增：${text}`, makeKeyboard(userId));
    }

    // 分支 2：呼喚選單
    if (["選單", "menu", "start", "/start"].includes(text.toLowerCase())) {
        return ctx.reply('請選擇分類進行篩選：', makeKeyboard(userId));
    }

    // 分支 3：個股查詢 (💡 限制必須以 P 或 p 開頭)
    if (text.toLowerCase().startsWith('p')) {
        const query = text.substring(1).trim();
        if (!query) return ctx.reply('💡 請在 P 後面輸入代號，例如：P2330');

        await ctx.reply(`🔍 正在查詢「${query}」...`);
        try {
            const snap = await getDocs(collection(db, "stocks"));
            const res = snap.docs.map(d => d.data()).filter(s => {
                const c = String(fuzzyGet(s, "代碼")).replace(/[ "]/g, "");
                const n = String(fuzzyGet(s, "名稱"));
                return c.includes(query) || n.includes(query);
            }).slice(0, 10);

            if (res.length === 0) return await ctx.reply(`❌ 找不到與「${query}」相關的股票。`);
            
            const list = res.map(s => `[${fuzzyGet(s,"代碼")}] ${fuzzyGet(s,"名稱")}\n價: ${fuzzyGet(s,"價格")} (${fuzzyGet(s,"漲跌幅")}%)\n產業: ${fuzzyGet(s,"產業")}\n力道: ${fuzzyGet(s,"籌碼力道")}\n`).join('\n');
            await ctx.reply(`🎯 查詢結果：\n\n${list}`);
        } catch (e) { await ctx.reply('❌ 查詢錯誤'); }
        return;
    }

    // 💡 其他輸入保持安靜，不予理會
});

export default async function (req, res) {
    if (req.method === 'POST') {
        await bot.handleUpdate(req.body);
        res.status(200).send('OK');
    } else {
        res.status(200).send('Bot Running');
    }
}