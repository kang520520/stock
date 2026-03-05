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
    "🔍 基礎屬性": ["股本(億)"], 
    "💰 籌碼動向": ["外資買賣超", "投信買賣超", "自營商買賣超", "近1日主力買賣超", "近5日主力買賣超", "近20日主力買賣超", "主力連續買賣天數", "主力連續買賣張數"],
    "📊 籌碼集中": ["近5日籌碼集中度", "近10日籌碼集中度", "近20日籌碼集中度", "近60日籌碼集中度"],
    "💎 財報回報": ["近5年平均現金殖利率%"]
};

const QUICK_OPTIONS = {
    "價格": ["5MA", "10MA", "20MA", "60MA"],
    "成交量(今日)": ["昨天", "前天", "大前天"],
    "籌碼力道": ["買壓增加", "買壓減緩", "賣壓增加", "買壓減緩"],
};

const INDUSTRY_GROUPS = {
    "🏭 傳產(A-L)": ["傳產-水泥", "傳產-食品", "傳產-塑膠", "傳產-紡織纖維", "傳產-電機", "傳產-電線電纜", "傳產-化學工業", "傳產-玻璃陶瓷", "傳產-紙業", "傳產-鋼鐵", "傳產-橡膠", "傳產-汽車", "傳產-汽車零組件"],
    "🏗️ 傳產(M-Z)": ["傳產-營建", "傳產-航運", "傳產-觀光", "傳產-百貨", "傳產-生技", "傳產-自行車", "傳產-高爾夫球", "傳產-其他"],
    "🧪 電子上步": ["電子上游-IC-設計", "電子上游-IC-代工", "電子上游-IC-製造", "電子上游-IC-封測", "電子上游-IC-通路", "電子上游-IC-其他", "電子上游-IC-DRAM製造", "電子上游-DRAM銷售", "電子上游-PCB-材料設備", "電子上游-PCB-製造", "電子上游-被動元件", "電子上游-連接元件", "電子上游-LED及光元件"],
    "🔌 電子中游": ["電子中游-EMS", "電子中游-通訊設備", "電子中游-主機板", "電子中游-網通", "電子中游-機殼", "電子中游-儀器設備工程", "電子中游-LCD-TFT面板", "電子中游-LCD-STN面板", "電子中游-LCD-零組件", "電子中游-光學鏡片", "電子中游-電源供應器", "電子中游-變壓器與UPS", "電子中游-NB與手機零組件", "電子中游-PC介面卡", "電子中游-其他"],
    "📱 電子下游": ["電子下游-筆記型電腦", "電子下游-手機製造", "電子下游-消費電子", "電子下游-安全監控", "電子下游-工業電腦", "電子下游-太陽能", "電子下游-資訊通路", "電子下游-電信服務", "電子下游-顯示器", "電子下游-掃描器", "電子下游-數位相機", "電子下游-光碟片", "電子下游-商業自動化", "電子下游-其他"],
    "💰 金融軟體": ["金融-金控", "金融-銀行", "金融-保險", "金融-證券", "軟體-系統整合", "軟體-遊戲", "軟體-其他"]
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

// 💡 產生按鈕的邏輯：改用按鈕，不要用文字連結
const getStockButtons = (code) => {
    return Markup.inlineKeyboard([
        Markup.button.url(`${code} 開啟 App`, `cmchipk://stock/${code}`),
        Markup.button.url('Yahoo 技術分析', `https://tw.stock.yahoo.com/quote/${code}/technical-analysis`)
    ]);
};

const makeMultiSelectKeyboard = (userId, param, subGroup = null) => {
    const state = userStates[userId];
    const selected = state.tempSelected || [];
    let btns = [];
    if (param === "產業" && !subGroup) {
        btns = Object.keys(INDUSTRY_GROUPS).map(g => [Markup.button.callback(g, `indgroup_${g}`)]);
    } else {
        const options = subGroup ? INDUSTRY_GROUPS[subGroup] : QUICK_OPTIONS[param];
        btns = options.map(opt => {
            if (param === "產業" || param === "籌碼力道") return [Markup.button.callback(opt, `pick_${opt}`)];
            const isSel = selected.includes(opt);
            return [Markup.button.callback(`${isSel ? '✅ ' : ''}${opt}`, `toggle_${opt}`)];
        });
        if (param !== "產業" && param !== "籌碼力道") btns.push([Markup.button.callback('✨ 確認送出', 'confirm_multi')]);
    }
    btns.push([Markup.button.callback('⬅️ 返回主選單', 'main')]);
    return Markup.inlineKeyboard(btns);
};

const makeKeyboard = (userId, group = null) => {
    const filters = userStates[userId]?.params || [];
    if (!group) {
        const btns = Object.keys(GROUPS).map(g => [Markup.button.callback(g, `menu_${g}`)]);
        const indCount = filters.filter(f => f.key === "產業").length;
        const forceCount = filters.filter(f => f.key === "籌碼力道").length;
        btns.push([
            Markup.button.callback(`🏭 產業專區${indCount > 0 ? ` [${indCount}]` : ''}`, 'set_產業'),
            Markup.button.callback(`⚡ 籌碼力道${forceCount > 0 ? ` [${forceCount}]` : ''}`, 'set_籌碼力道')
        ]);
        const total = filters.length > 0 ? ` (${filters.length}項)` : '';
        if (filters.length > 0) btns.push([Markup.button.callback('📋 查看 / 刪除個別條件', 'view_filters')]);
        btns.push([Markup.button.callback(`🚀 執行選股${total}`, 'run'), Markup.button.callback('🧹 全部清空', 'reset')]);
        return Markup.inlineKeyboard(btns);
    }
    const btns = GROUPS[group].map(p => [Markup.button.callback(p, `set_${p}`)]);
    btns.push([Markup.button.callback('⬅️ 返回主選單', 'main')]);
    return Markup.inlineKeyboard(btns);
};

bot.start((ctx) => {
    userStates[ctx.from.id] = { params: [], stage: null, tempOp: null, tempSelected: [] };
    return ctx.reply('查詢單股請輸入 P+代號 (例: P2330或P台積電)', makeKeyboard(ctx.from.id));
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
            state.stage = null; state.tempOp = null; state.tempSelected = [];
            await ctx.editMessageText('請選擇篩選分類：', makeKeyboard(userId));
        } else if (data === 'run') {
            if (state.params.length === 0) return ctx.reply('⚠️ 請先設定條件。');
            const snap = await getDocs(collection(db, "stocks"));
            const stocks = snap.docs.map(d => d.data());
            const res = stocks.filter(s => state.params.every(f => {
                const sv = fuzzyGet(s, f.key);
                if (f.op === 'include') return String(sv || "").includes(f.val);
                let v = parseFloat(sv.toString().replace(/[%,]/g, '')) || 0;
                const vm = { "昨天": "成交量1", "前天": "成交量2", "大前天": "成交量3" };
                const mv = vm[f.val] || f.val.toUpperCase();
                let tv = (["價格", "成交量(今日)"].includes(f.key) && ["5MA", "10MA", "20MA", "60MA", "成交量1", "成交量2", "成交量3"].includes(mv)) 
                         ? parseFloat(fuzzyGet(s, mv)) || 0 : parseFloat(f.val.replace(/[^\d.-]/g, '')) || 0;
                return f.op==='>=' ? v>=tv : f.op==='<=' ? v<=tv : v==tv;
            }));
            
            if (res.length === 0) return ctx.reply('❌ 無符合股票');

            await ctx.reply(`🎯 找到 ${res.length} 支股票。`);
            // 💡 改成一支一支發送，下方帶按鈕 (防止連結失效)
            for (const s of res.slice(0, 15)) {
                const code = String(fuzzyGet(s, "代碼")).replace(/[ "]/g, "");
                const name = fuzzyGet(s, "名稱");
                const price = fuzzyGet(s, "價格");
                const pv = parseFloat(fuzzyGet(s, "漲跌幅")) || 0;
                const text = `[${code}] ${name}\n價: ${price} (${pv > 0 ? '+' : ''}${pv}%)\n產業: ${fuzzyGet(s, "產業")}`;
                await ctx.reply(text, getStockButtons(code));
            }
        } else if (data.startsWith('pick_')) {
            const val = data.replace('pick_', '');
            state.params = state.params.filter(f => f.key !== state.stage);
            state.params.push({ key: state.stage, op: state.tempOp, val: val });
            await ctx.reply(`✅ 已更新條件`, makeKeyboard(userId));
        } else if (data.startsWith('set_')) {
            const param = data.replace('set_', '');
            state.stage = param;
            if (["產業", "籌碼力道"].includes(param)) {
                state.tempOp = "include";
                await ctx.editMessageText(`請選擇 [${param}]：`, makeMultiSelectKeyboard(userId, param));
            } else {
                await ctx.editMessageText(`請選擇符號：`, Markup.inlineKeyboard([
                    [Markup.button.callback('≥', `op_${param}_>=`), Markup.button.callback('≤', `op_${param}_<=`)],
                    [Markup.button.callback('=', `op_${param}_==`), Markup.button.callback('含', `op_${param}_include`)],
                    [Markup.button.callback('⬅️ 返回', 'main')]
                ]));
            }
        } else if (data.startsWith('indgroup_')) {
            await ctx.editMessageText(`設定項目：`, makeMultiSelectKeyboard(userId, "產業", data.replace('indgroup_', '')));
        } else if (data.startsWith('op_')) {
            const p = data.split('_'); state.stage = p[1]; state.tempOp = p[2];
            if (QUICK_OPTIONS[state.stage]) await ctx.editMessageText(`請勾選：`, makeMultiSelectKeyboard(userId, state.stage));
            else await ctx.reply(`💬 請輸入數值：`);
        } else if (data.startsWith('toggle_')) {
            const opt = data.replace('toggle_', '');
            state.tempSelected = state.tempSelected.includes(opt) ? state.tempSelected.filter(x => x !== opt) : [...state.tempSelected, opt];
            await ctx.editMessageReplyMarkup(ctx.callbackQuery.message.reply_markup);
        } else if (data === 'confirm_multi') {
            state.tempSelected.forEach(v => state.params.push({ key: state.stage, op: state.tempOp, val: v }));
            state.tempSelected = []; await ctx.reply(`✅ 已新增條件`, makeKeyboard(userId));
        }
    } catch (e) { console.error(e); }
});

bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text.trim();
    const state = userStates[userId];

    if (state?.stage) {
        if (["產業", "籌碼力道"].includes(state.stage)) state.params = state.params.filter(f => f.key !== state.stage);
        state.params.push({ key: state.stage, op: state.tempOp, val: text });
        state.stage = null; return ctx.reply(`✅ 已更新`, makeKeyboard(userId));
    }

    if (text.toLowerCase().startsWith('p')) {
        const q = text.substring(1).trim();
        const snap = await getDocs(collection(db, "stocks"));
        const res = snap.docs.map(d => d.data()).filter(s => String(fuzzyGet(s, "代碼")).includes(q) || String(fuzzyGet(s, "名稱")).includes(q));
        if (res.length > 0) {
            for (const s of res.slice(0, 5)) {
                const code = String(fuzzyGet(s, "代碼")).replace(/[ "]/g, "");
                await ctx.reply(`[${code}] ${fuzzyGet(s, "名稱")}\n價: ${fuzzyGet(s, "價格")}`, getStockButtons(code));
            }
        } else ctx.reply('❌ 找不到股票');
    }
});

export default async function (req, res) {
    if (req.method === 'POST') { await bot.handleUpdate(req.body); res.status(200).send('OK'); }
    else res.status(200).send('Running');
}