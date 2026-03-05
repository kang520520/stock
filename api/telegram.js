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

// 產生個股項目字串 (含 App 與 Yahoo 連結)
const getStockItemString = (s, idx, offset) => {
    const code = String(fuzzyGet(s, "代碼")).replace(/[ "]/g, "");
    const name = fuzzyGet(s, "名稱");
    const price = fuzzyGet(s, "價格");
    const cv = parseFloat(fuzzyGet(s, "漲跌")) || 0;
    const pv = parseFloat(fuzzyGet(s, "漲跌幅")) || 0;
    
    // 連結設定：代號連至籌碼K線，YAHOO連至網頁
    const appUrl = `cmchipk://stock/${code}`;
    const yahooUrl = `https://tw.stock.yahoo.com/quote/${code}/technical-analysis`;
    
    const getS = (v) => (v > 0 ? "上漲" : v < 0 ? "下跌" : "平盤");
    const getP = (v) => (v > 0 ? "漲幅" : v < 0 ? "跌幅" : "平盤");

    return `${offset + idx + 1}. [${code}](${appUrl}) [YAHOO](${yahooUrl}) ${name}\n價格: ${price} (${getS(cv)}${Math.abs(cv).toFixed(2)} / ${getP(pv)}${Math.abs(pv).toFixed(2)}%)\n產業: ${fuzzyGet(s, "產業") || "未分類"}\n`;
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
            if (param === "產業" || param === "籌碼力道") {
                return [Markup.button.callback(opt, `pick_${opt}`)];
            }
            const isSel = selected.includes(opt);
            return [Markup.button.callback(`${isSel ? '✅ ' : ''}${opt}`, `toggle_${opt}`)];
        });
        if (param !== "產業" && param !== "籌碼力道") {
            btns.push([Markup.button.callback('✨ 確認送出', 'confirm_multi')]);
        }
    }

    if (param !== "籌碼力道" && (param !== "產業" || subGroup)) {
        btns.push([Markup.button.callback('⌨️ 手動輸入', 'manual_input')]);
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
    const btns = GROUPS[group].map(p => {
        const count = filters.filter(f => f.key === p).length;
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
        [Markup.button.callback('⬅️ 返回主選單', 'main')]
    ]);
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
            await ctx.editMessageText('請選擇分類進行條件篩選：', makeKeyboard(userId));
        } 
        else if (data === 'view_filters') {
            const btns = state.params.map((f, i) => [Markup.button.callback(`❌ ${f.key} ${f.op} ${f.val}`, `del_${i}`)]);
            btns.push([Markup.button.callback('⬅️ 返回主選單', 'main')]);
            await ctx.editMessageText('點擊 ❌ 可個別刪除條件：', Markup.inlineKeyboard(btns));
        }
        else if (data.startsWith('menu_')) {
            await ctx.editMessageText(`設定 [${data.split('_')[1]}]：`, makeKeyboard(userId, data.split('_')[1]));
        } 
        else if (data.startsWith('set_')) {
            const param = data.replace('set_', '');
            state.stage = param; state.tempSelected = [];
            if (param === "產業" || param === "籌碼力道") {
                state.tempOp = "include";
                await ctx.editMessageText(`請選擇 [${param}]：`, makeMultiSelectKeyboard(userId, param));
            } else {
                await ctx.editMessageText(`請選擇 [${param}] 的條件：`, makeOperatorKeyboard(param));
            }
        } 
        else if (data.startsWith('indgroup_')) {
            const groupName = data.replace('indgroup_', '');
            await ctx.editMessageText(`設定 [${groupName}]：`, makeMultiSelectKeyboard(userId, "產業", groupName));
        }
        else if (data.startsWith('pick_')) {
            const val = data.replace('pick_', '');
            // 💡 覆蓋舊選項邏輯
            state.params = state.params.filter(f => f.key !== state.stage);
            state.params.push({ key: state.stage, op: state.tempOp, val: val });
            const currentStageName = state.stage;
            state.stage = null;
            await ctx.reply(`✅ [${currentStageName}] 已更新為：${val}`, makeKeyboard(userId));
        }
        else if (data.startsWith('op_')) {
            const parts = data.split('_');
            state.stage = parts[1]; state.tempOp = parts[2];
            if (QUICK_OPTIONS[state.stage]) {
                await ctx.editMessageText(`請勾選 [${state.stage}] (可多選)：`, makeMultiSelectKeyboard(userId, state.stage));
            } else {
                await ctx.reply(`💬 請輸入 [${state.stage}] 的數值：`);
            }
        } 
        else if (data.startsWith('toggle_')) {
            const opt = data.replace('toggle_', '');
            if (!state.tempSelected.includes(opt)) state.tempSelected.push(opt);
            else state.tempSelected = state.tempSelected.filter(i => i !== opt);
            const currentMsgText = ctx.callbackQuery.message.text;
            const subGroupMatch = currentMsgText.match(/設定 \[(.*?)\]/);
            const subGroup = subGroupMatch ? subGroupMatch[1] : null;
            await ctx.editMessageReplyMarkup(makeMultiSelectKeyboard(userId, state.stage, subGroup).reply_markup);
        } 
        else if (data === 'confirm_multi') {
            if (state.tempSelected.length === 0) return await ctx.reply('⚠️ 請至少勾選一個項目！');
            state.tempSelected.forEach(v => state.params.push({ key: state.stage, op: state.tempOp, val: v }));
            const summary = state.tempSelected.join(', ');
            state.tempSelected = []; state.stage = null;
            await ctx.reply(`✅ 已批次新增：${summary}`, makeKeyboard(userId));
        }
        else if (data === 'manual_input') {
            await ctx.reply(`💬 請輸入 [${state.stage}] 的自定義內容：`);
        }
        else if (data.startsWith('del_')) {
            state.params.splice(parseInt(data.replace('del_', '')), 1);
            await ctx.editMessageText('已更新條件：', makeKeyboard(userId));
        } 
        else if (data === 'run') {
            if (state.params.length === 0) return await ctx.reply('⚠️ 攔截執行：您目前尚未設定任何條件！');
            const loadingMsg = await ctx.reply('🔍 正在連線 Firebase 過濾資料，請稍候...');
            try {
                const snap = await getDocs(collection(db, "stocks"));
                const allStocks = snap.docs.map(d => d.data());
                const filters = state.params;
                const result = allStocks.filter(s => filters.every(f => {
                    const sv = fuzzyGet(s, f.key);
                    if (f.op === 'include') return String(sv || "").includes(f.val);
                    let v = parseFloat(sv.toString().replace(/[%,]/g, '')) || 0;
                    const volMapping = { "昨天": "成交量1", "前天": "成交量2", "大前天": "成交量3" };
                    const mv = volMapping[f.val] || f.val.toUpperCase();
                    let tv = (["價格", "成交量(今日)"].includes(f.key) && ["5MA", "10MA", "20MA", "60MA", "成交量1", "成交量2", "成交量3"].includes(mv)) 
                             ? parseFloat(fuzzyGet(s, mv)) || 0 : parseFloat(f.val.replace(/[^\d.-]/g, '')) || 0;
                    return f.op==='>=' ? v>=tv : f.op==='<=' ? v<=tv : v==tv;
                }));

                if (result.length === 0) return await ctx.reply('❌ 無符合股票');

                await ctx.reply(`🎯 篩選結果 (共 ${result.length} 支)\n條件: ${filters.map(f => `${f.key}${f.op}${f.val}`).join(', ')}`);
                const chunkSize = 20; 
                for (let i = 0; i < result.length; i += chunkSize) {
                    const chunk = result.slice(i, i + chunkSize);
                    const list = chunk.map((s, idx) => getStockItemString(s, idx, i)).join('\n');
                    await ctx.reply(list, { parse_mode: 'Markdown', disable_web_page_preview: true });
                    await new Promise(r => setTimeout(r, 500));
                }
                await ctx.reply(`🔗 [網頁版清單](https://stock-eosin-kappa.vercel.app/)`);
            } catch (innerError) {
                await ctx.reply('❌ 讀取資料超時或失敗，請稍後再試。');
            }
        }
    } catch (e) { console.error(e); }
});

bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text.trim();
    if (!userStates[userId]) userStates[userId] = { params: [], stage: null };
    const state = userStates[userId];

    if (state.stage) {
        // 💡 手動輸入時也套用單選覆蓋邏輯
        if (state.stage === "產業" || state.stage === "籌碼力道") state.params = state.params.filter(f => f.key !== state.stage);
        state.params.push({ key: state.stage, op: state.tempOp, val: text });
        const currentStageName = state.stage;
        state.stage = null; state.tempOp = null;
        return await ctx.reply(`✅ [${currentStageName}] 已更新為：${text}`, makeKeyboard(userId));
    }

    if (["選單", "menu", "start", "篩選"].includes(text.toLowerCase())) {
        userStates[userId] = { params: [], stage: null, tempOp: null, tempSelected: [] };
        return ctx.reply('請選擇分類進行篩選：', makeKeyboard(userId));
    }

    if (text.toLowerCase().startsWith('p')) {
        const query = text.substring(1).trim();
        if (!query) return ctx.reply('💡 請輸入代號，例如 P2330');
        await ctx.reply(`🔍 正在查詢「${query}」...`);
        try {
            const snap = await getDocs(collection(db, "stocks"));
            const res = snap.docs.map(d => d.data()).filter(s => 
                String(fuzzyGet(s, "代碼")).includes(query) || String(fuzzyGet(s, "名稱")).includes(query)
            );
            if (res.length === 0) return await ctx.reply(`❌ 找不到相關股票。`);
            
            const list = res.slice(0, 10).map((s, idx) => getStockItemString(s, idx, 0)).join('\n');
            await ctx.reply(`🎯 查詢結果 ：\n${list}`, { parse_mode: 'Markdown', disable_web_page_preview: true });
        } catch (e) { await ctx.reply('❌ 查詢出錯。'); }
    }
});

export default async function (req, res) {
    if (req.method === 'POST') {
        try {
            await bot.handleUpdate(req.body);
            if (!res.headersSent) res.status(200).send('OK');
        } catch (err) {
            if (!res.headersSent) res.status(200).send('OK');
        }
    } else {
        res.status(200).send('Bot Running');
    }
}