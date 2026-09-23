// ====== 数据结构 ======
let state = {
  myName: "我",
  myAvatar: "",
  background: "",
  currentDream: "dream1",
  dreams: {
    dream1: {
      name: "梦角",
      avatar: "",
      groups: {
        "默认": ["今天心情如何？", "TA 在干嘛？", "晚饭吃什么？"],
      },
    },
  },
  fontSize: 15,
  fontColor: "#000000",
  bubbleCSS: "",
  favorites: [],
  emojis: [], // 自定义表情，存 base64
};

let currentGroup = "默认";
let lastSender = null;
let quoting = null;
let db;

function openDB() {
  return new Promise((resolve) => {
    const req = indexedDB.open("dream_db", 3);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains("images")) {
        req.result.createObjectStore("images");
      }
      if (!req.result.objectStoreNames.contains("emojis")) {
        req.result.createObjectStore("emojis", { autoIncrement: true });
      }
    };
    req.onsuccess = () => { db = req.result; resolve(); };
  });
}

function saveImage(key, dataUrl) {
  return new Promise((resolve) => {
    const tx = db.transaction("images", "readwrite");
    tx.objectStore("images").put(dataUrl, key);
    tx.oncomplete = resolve;
  });
}

function loadImage(key) {
  return new Promise((resolve) => {
    const tx = db.transaction("images", "readonly");
    const req = tx.objectStore("images").get(key);
    req.onsuccess = () => resolve(req.result || "");
  });
}

// 表情存储
function saveAllEmojis() {
  return new Promise((resolve) => {
    const tx = db.transaction("emojis", "readwrite");
    const store = tx.objectStore("emojis");
    store.clear();
    state.emojis.forEach(e => store.add(e));
    tx.oncomplete = resolve;
  });
}

function loadAllEmojis() {
  return new Promise((resolve) => {
    const tx = db.transaction("emojis", "readonly");
    const req = tx.objectStore("emojis").getAll();
    req.onsuccess = () => { state.emojis = req.result || []; resolve(); };
  });
}

function saveState() {
  const light = {
    myName: state.myName,
    currentDream: state.currentDream,
    dreams: state.dreams,
    fontSize: state.fontSize,
    fontColor: state.fontColor,
    bubbleCSS: state.bubbleCSS,
    favorites: state.favorites,
  };
  localStorage.setItem("dream_state", JSON.stringify(light));
}

function loadState() {
  const saved = localStorage.getItem("dream_state");
  if (saved) Object.assign(state, JSON.parse(saved));
}

function currentDream() {
  return state.dreams[state.currentDream];
}

function pickCard() {
  const groups = currentDream().groups;
  const all = Object.values(groups).flat();
  if (all.length === 0) return "（字卡库是空的）";
  return all[Math.floor(Math.random() * all.length)];
}

function nowTime() {
  const d = new Date();
  return d.getHours().toString().padStart(2, "0") + ":" +
         d.getMinutes().toString().padStart(2, "0");
}

// ====== 渲染消息 ======
function addMsg(content, who, quote = null, type = "text") {
  const chat = document.getElementById("chat");

  const needTimestamp = lastSender !== who;
  if (needTimestamp) {
    const timeDiv = document.createElement("div");
    timeDiv.className = "timestamp";
    timeDiv.innerText = nowTime();
    chat.appendChild(timeDiv);
  }

  const div = document.createElement("div");
  div.className = "msg " + (who === "me" ? "me" : "dream");
  div.dataset.type = type;
  div.dataset.content = content;

  // 引用摘要
  div.dataset.text = type === "text" ? content : (type === "image" ? "[图片]" : "[表情]");

  const avatar = who === "me" ? state.myAvatar : currentDream().avatar;

  let quoteHTML = "";
  if (quote) quoteHTML = `<div class="quote-block">引用：${quote}</div>`;

  let bodyHTML;
  if (type === "image") {
    bodyHTML = `<img class="chat-img" src="${content}">`;
  } else if (type === "emoji") {
    bodyHTML = `<img class="chat-emoji" src="${content}">`;
  } else {
    bodyHTML = content;
  }

  div.innerHTML = `
    <div class="avatar">${avatar ? `<img src="${avatar}">` : ""}</div>
    <div class="bubble">${quoteHTML}${bodyHTML}</div>
  `;

  div.querySelector(".bubble").addEventListener("click", (e) => {
    e.stopPropagation();
    openMsgMenu(e.clientX, e.clientY, div);
  });

  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
  lastSender = who;
}

// ====== 发送文字 ======
function sendText() {
  const input = document.getElementById("msgInput");
  const text = input.value.trim();
  if (!text) return;

  addMsg(text, "me", quoting);
  input.value = "";
  cancelQuote();
  saveState();

  if (Math.random() < 0.005) {
    setTimeout(() => startVideoCall("dream"), 800);
  } else {
    setTimeout(() => {
      // 梦角有几率发表情
      if (state.emojis.length > 0 && Math.random() < 0.2) {
        const e = state.emojis[Math.floor(Math.random() * state.emojis.length)];
        addMsg(e, "dream", null, "emoji");
      } else {
        addMsg(pickCard(), "dream");
      }
    }, 600);
  }
}

// ====== 发送图片 ======
function sendImage(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    addMsg(reader.result, "me", quoting, "image");
    cancelQuote();
  };
  reader.readAsDataURL(file);
  event.target.value = "";
}

// ====== 表情面板 ======
function toggleEmoji() {
  document.getElementById("emojiPanel").classList.toggle("hidden");
  renderEmojiGrid();
}

function renderEmojiGrid() {
  const grid = document.getElementById("emojiGrid");
  grid.innerHTML = "";
  state.emojis.forEach((dataUrl, index) => {
    const img = document.createElement("img");
    img.src = dataUrl;
    // 点击直接发送
    img.onclick = () => {
      addMsg(dataUrl, "me", quoting, "emoji");
      cancelQuote();
    };
    // 长按删除
    let pressTimer;
    img.onmousedown = () => {
      pressTimer = setTimeout(() => {
        if (confirm("删除这个表情？")) {
          state.emojis.splice(index, 1);
          saveAllEmojis();
          renderEmojiGrid();
        }
      }, 800);
    };
    img.onmouseup = img.onmouseleave = () => clearTimeout(pressTimer);
    grid.appendChild(img);
  });
}

function uploadEmoji(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    state.emojis.push(reader.result);
    await saveAllEmojis();
    renderEmojiGrid();
  };
  reader.readAsDataURL(file);
  event.target.value = "";
}

// ====== 消息菜单 ======
let menuTarget = null;

function openMsgMenu(x, y, el) {
  menuTarget = el;
  const menu = document.getElementById("msgMenu");
  menu.style.left = x + "px";
  menu.style.top = y + "px";
  menu.classList.remove("hidden");
}

document.addEventListener("click", () => {
  document.getElementById("msgMenu").classList.add("hidden");
});

function menuReply() {
  const text = menuTarget.dataset.text;
  quoting = text;
  document.getElementById("quoteText").innerText = "引用：" + text;
  document.getElementById("quoteBar").classList.remove("hidden");
}

function cancelQuote() {
  quoting = null;
  document.getElementById("quoteBar").classList.add("hidden");
}

function menuDelete() {
  menuTarget.remove();
}

function menuFavorite() {
  state.favorites.push({
    type: menuTarget.dataset.type,
    content: menuTarget.dataset.content,
  });
  saveState();
  alert("已收藏");
}

// ====== 外部气泡 CSS ======
function applyBubbleCSS() {
  const url = document.getElementById("setBubbleCSS").value.trim();
  if (!url) return;
  state.bubbleCSS = url;
  loadBubbleCSS(url);
  saveState();
}

function clearBubbleCSS() {
  state.bubbleCSS = "";
  const old = document.getElementById("externalBubbleCSS");
  if (old) old.remove();
  saveState();
}

function loadBubbleCSS(url) {
  let link = document.getElementById("externalBubbleCSS");
  if (!link) {
    link = document.createElement("link");
    link.rel = "stylesheet";
    link.id = "externalBubbleCSS";
    document.head.appendChild(link);
  }
  link.href = url;
}

function startVideoCall(from) {
  const modal = document.getElementById("callModal");
  const text = document.getElementById("callText");
  const name = document.getElementById("callName");
  const avatarImg = document.getElementById("callAvatarImg");

  // 显示的是对方的头像（梦角）
  name.innerText = currentDream().name;
  avatarImg.src = currentDream().avatar || "";
  avatarImg.style.display = currentDream().avatar ? "block" : "none";

  text.innerText = from === "me"
    ? "正在呼叫..."
    : `${currentDream().name} 邀请你视频通话`;

  modal.classList.remove("hidden");
}

// ====== 分组 ======
function renderGroupTabs() {
  const box = document.getElementById("groupTabs");
  if (!box) return;
  box.innerHTML = "";
  Object.keys(currentDream().groups).forEach(g => {
    const btn = document.createElement("button");
    btn.innerText = g + (g === currentGroup ? " ✓" : "");
    btn.style.margin = "4px";
    btn.onclick = () => {
      saveCurrentGroupCards();
      currentGroup = g;
      renderGroupTabs();
      document.getElementById("setCards").value = currentDream().groups[g].join("\n");
    };
    box.appendChild(btn);
  });
}

function saveCurrentGroupCards() {
  const text = document.getElementById("setCards").value;
  currentDream().groups[currentGroup] = text.split("\n").map(s => s.trim()).filter(s => s);
}

function addGroup() {
  const name = prompt("新分组名字：");
  if (!name || currentDream().groups[name]) return;
  saveCurrentGroupCards();
  currentDream().groups[name] = [];
  currentGroup = name;
  renderGroupTabs();
  document.getElementById("setCards").value = "";
}

function deleteGroup() {
  const keys = Object.keys(currentDream().groups);
  if (keys.length <= 1) { alert("至少保留一个分组。"); return; }
  delete currentDream().groups[currentGroup];
  currentGroup = Object.keys(currentDream().groups)[0];
  renderGroupTabs();
  document.getElementById("setCards").value = currentDream().groups[currentGroup].join("\n");
}

// ====== 设置面板 ======
function openSettings() {
  document.getElementById("setMyName").value = state.myName;
  document.getElementById("setDreamName").value = currentDream().name;
  document.getElementById("setFontSize").value = state.fontSize;
  document.getElementById("setFontColor").value = state.fontColor;
  document.getElementById("setBubbleCSS").value = state.bubbleCSS || "";

  currentGroup = Object.keys(currentDream().groups)[0];
  renderGroupTabs();
  document.getElementById("setCards").value = currentDream().groups[currentGroup].join("\n");
  document.getElementById("settingsPanel").classList.remove("hidden");
}
function closeSettings() {
  document.getElementById("settingsPanel").classList.add("hidden");
}
function saveSettings() {
  state.myName = document.getElementById("setMyName").value || "我";
  currentDream().name = document.getElementById("setDreamName").value || "梦角";
  state.fontSize = parseInt(document.getElementById("setFontSize").value) || 15;
  state.fontColor = document.getElementById("setFontColor").value;
  saveCurrentGroupCards();
  saveState();
  applySettings();
  closeSettings();
}

// ====== 应用设置 ======
function applySettings() {
  document.getElementById("contactName").innerText = currentDream().name;
  const chat = document.getElementById("chat");
  chat.style.backgroundImage = state.background ? `url(${state.background})` : "";
  chat.style.setProperty("--font-size", state.fontSize + "px");
  chat.style.setProperty("--font-color", state.fontColor);
  if (state.bubbleCSS) loadBubbleCSS(state.bubbleCSS);
}

// ====== 图片上传 ======
function bindUpload(id, key) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener("change", e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      if (key === "myAvatar" || key === "background") {
        state[key] = reader.result;
      } else if (key === "dreamAvatar") {
        currentDream().avatar = reader.result;
      }
      await saveImage(key, reader.result);
      applySettings();
    };
    reader.readAsDataURL(file);
  });
}

// ====== 初始化 ======
async function init() {
  await openDB();
  loadState();
  await loadAllEmojis();

  for (const key of Object.keys(state.dreams)) {
    const img = await loadImage("avatar_" + key);
    if (img) state.dreams[key].avatar = img;
  }
  state.myAvatar = await loadImage("myAvatar");
  state.background = await loadImage("background");

  applySettings();
  bindUpload("setMyAvatar", "myAvatar");
  bindUpload("setDreamAvatar", "avatar_" + state.currentDream);
  bindUpload("setBg", "background");
}
init();

function toggleVoice() {
  alert("语音功能待实现，可以先做文字版。");
}
// ====== 导出聊天记录为图片 ======
async function exportChat() {
  const chat = document.getElementById("chat");
  const app = document.getElementById("app");

  if (chat.children.length === 0) {
    alert("还没有聊天记录可以导出。");
    return;
  }

  // 给 app 加个标记，隐藏输入栏等无关元素
  app.classList.add("exporting");

  try {
    const canvas = await html2canvas(chat, {
      backgroundColor: "#f7f8fa",
      scale: 2,          // 2 倍分辨率，更清晰
      useCORS: true,
      scrollY: -window.scrollY,
      windowHeight: chat.scrollHeight,
      height: chat.scrollHeight,
    });

    // 触发下载
    const link = document.createElement("a");
    const time = new Date().toISOString().slice(0, 10);
    link.download = `聊天记录_${time}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  } catch (err) {
    console.error(err);
    alert("导出失败，请检查网络是否能加载 html2canvas。");
  } finally {
    app.classList.remove("exporting");
  }
}
function endCall() {
  document.getElementById("callModal").classList.add("hidden");
}