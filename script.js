(() => {
  "use strict";

  const STORAGE_KEY = "habitflow-final-v8";
  const THEME_KEY = "habitflow-theme";

  const COLORS = {
    indigo: { bg: "bg-indigo-50 dark:bg-indigo-950/60", text: "text-indigo-700 dark:text-indigo-300", bar: "bg-indigo-600" }
  };

  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];

  let habits = loadHabits(); 
  let activeRange = 7;
  let toastTimer = null;

  // Stopwatch State
  let timerInterval = null;
  let timerSeconds = 0;
  let timerTaskId = null;

  function dateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function shiftDate(date, amount) {
    const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    result.setDate(result.getDate() + amount);
    return result;
  }

  function formatDate(date, options = { month: "short", day: "numeric" }) {
    return new Intl.DateTimeFormat(undefined, options).format(date);
  }

  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
  }

  function loadHabits() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function saveHabits() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(habits)); } catch (error) { showToast("Could not save."); }
  }

  function getTodayDoneCount() {
    const today = dateKey();
    return habits.filter(h => h.dateCreated === today && h.completed === true).length;
  }
  
  function getTodayTotalCount() {
    const today = dateKey();
    return habits.filter(h => h.dateCreated === today).length;
  }

  function calculateMonthlyRate() {
    const currentMonthStr = dateKey().slice(0, 7);
    const monthHabits = habits.filter(h => h.dateCreated.startsWith(currentMonthStr));
    if (monthHabits.length === 0) return 0;
    const done = monthHabits.filter(h => h.completed === true).length;
    return Math.round((done / monthHabits.length) * 100);
  }

  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.remove("hidden", "toast");
    void toast.offsetWidth;
    toast.classList.add("toast");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add("hidden"), 2600);
  }

  // Format time for Stopwatch (MM:SS)
  function formatTime(totalSeconds) {
    const m = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const s = String(totalSeconds % 60).padStart(2, '0');
    return `${m}:${s}`;
  }

  function render() {
    renderHeader();
    renderStats();
    renderHabits();
    renderCalendar();
    renderChart();
  }

  function renderHeader() {
    $("#todayLabel").textContent = formatDate(new Date(), {
      weekday: "long", month: "long", day: "numeric", year: "numeric"
    });
  }

  function renderStats() {
    const totalToday = getTodayTotalCount();
    const doneToday = getTodayDoneCount();
    const percentage = totalToday ? Math.round(doneToday / totalToday * 100) : 0;

    $("#progressValue").textContent = `${percentage}%`;
    $("#progressCount").textContent = `${doneToday} of ${totalToday} done`;
    $("#progressBar").style.width = `${percentage}%`;
    
    $("#habitTotal").textContent = totalToday;
    $("#doneTotal").textContent = doneToday;
    $("#monthlyRate").textContent = `${calculateMonthlyRate()}%`;
  }

  function renderHabits() {
    const list = $("#habitList");
    const emptyState = $("#emptyState");
    const filterEmpty = $("#filterEmpty");

    list.innerHTML = "";
    emptyState.classList.toggle("hidden", habits.length !== 0);

    const filter = $("#filterSelect").value;
    const today = dateKey();
    
    const visible = habits.filter(habit => {
      const isToday = habit.dateCreated === today;
      if (filter === "remaining") return isToday && !habit.completed;
      if (filter === "completed") return isToday && habit.completed;
      return true; 
    });

    filterEmpty.classList.toggle("hidden", habits.length === 0 || visible.length !== 0);

    if (!habits.length || !visible.length) return;

    for (const habit of visible) {
      const color = COLORS.indigo;
      const isToday = habit.dateCreated === today;
      const isLocked = !isToday;
      const done = habit.completed;
      
      const days = [];
      for (let i = activeRange - 1; i >= 0; i--) {
        const date = shiftDate(new Date(), -i);
        const key = dateKey(date);
        const complete = (habit.dateCreated === key && habit.completed);
        
        days.push(`
          <div class="flex min-w-0 flex-col items-center gap-1">
            <span class="text-[10px] text-slate-400">${formatDate(date, { weekday: "narrow" })}</span>
            <span class="day-dot ${complete ? "done" : ""}">
              ${complete ? "✓" : ""}
            </span>
          </div>
        `);
      }

      const article = document.createElement("article");
      article.className = `p-5 transition hover:bg-slate-50 dark:hover:bg-slate-800/40 ${
        done ? "bg-emerald-50/30 dark:bg-emerald-950/10" : ""
      } ${isLocked ? "opacity-75" : ""}`;

      const createdDateStr = formatDate(new Date(habit.dateCreated + "T00:00:00"), { month: "short", day: "numeric", year: "numeric" });
      
      let timerHTML = "";
      let timerBtnHTML = "";

      if (isToday) {
         const timeElapsed = habit.timeSpent ? formatTime(habit.timeSpent) : "00:00";
         const isRunning = timerTaskId === habit.id;
         const timerIcon = isRunning ? "⏸" : "▶";
         const timerText = isRunning ? formatTime(timerSeconds) : timeElapsed;

         timerBtnHTML = `
            <button type="button" data-action="timer" data-id="${escapeHTML(habit.id)}"
              class="rounded-lg px-3 py-2 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:text-indigo-300 dark:hover:bg-indigo-900 transition">
              ${timerIcon} ${timerText}
            </button>
         `;
      } else if (habit.timeSpent) {
         timerBtnHTML = `
            <div class="rounded-lg px-3 py-2 text-xs font-semibold text-slate-500 bg-slate-100 dark:bg-slate-800">
              ⏱ ${formatTime(habit.timeSpent)}
            </div>
         `;
      }

      article.innerHTML = `
        <div class="flex items-start gap-3">
          <label class="mt-1 cursor-pointer">
            <input type="checkbox" class="habit-check" data-action="toggle" data-id="${escapeHTML(habit.id)}" 
              ${done ? "checked" : ""} 
              ${isLocked ? "disabled" : ""}>
          </label>

          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex items-center gap-2">
                <span class="flex h-9 w-9 items-center justify-center rounded-xl text-lg ${color.bg}">
                  ${escapeHTML(habit.emoji)}
                </span>
                <h3 class="break-words font-bold ${done ? "text-slate-400 dark:text-slate-500" : ""}">${escapeHTML(habit.name)}</h3>
              </div>
            </div>

            <div class="mt-2 flex items-center justify-between">
              <div class="text-xs font-semibold text-indigo-500">
                Date: ${createdDateStr} ${isLocked ? "(Locked)" : ""}
              </div>
              <div>${timerBtnHTML}</div>
            </div>

            <div class="mt-3 flex justify-end gap-2">
              <button type="button" data-action="delete" data-id="${escapeHTML(habit.id)}"
                class="rounded-lg px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950">
                Delete
              </button>
            </div>

            <div class="mt-4 grid gap-1" style="grid-template-columns:repeat(${activeRange},minmax(0,1fr))">
              ${days.join("")}
            </div>
          </div>
        </div>
      `;
      list.appendChild(article);
    }
  }

  function renderCalendar() {
    const grid = $("#weekGrid");
    grid.innerHTML = "";
    $("#rangeDescription").textContent = `Last ${activeRange} days`;

    for (let i = activeRange - 1; i >= 0; i--) {
      const date = shiftDate(new Date(), -i);
      const key = dateKey(date);
      
      const dayHabits = habits.filter(h => h.dateCreated === key);
      const total = dayHabits.length;
      const done = dayHabits.filter(h => h.completed).length;
      const allDone = total > 0 && done === total;

      const cell = document.createElement("div");
      cell.className = "flex min-w-0 flex-col items-center gap-1.5";
      cell.title = `${formatDate(date)} — ${done}/${total} tasks completed`;

      cell.innerHTML = `
        <span class="text-[10px] text-slate-400">${formatDate(date, { weekday: "narrow" })}</span>
        <span class="flex h-8 w-8 items-center justify-center rounded-xl text-xs font-bold ${
          allDone ? "bg-indigo-600 text-white" : done > 0 ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300" : "border border-slate-200 text-slate-400 dark:border-slate-700"
        }">${date.getDate()}</span>
      `;
      grid.appendChild(cell);
    }
  }

  function renderChart() {
    const chart = $("#chart");
    chart.innerHTML = "";

    for (let i = 6; i >= 0; i--) {
      const date = shiftDate(new Date(), -i);
      const key = dateKey(date);
      
      const dayHabits = habits.filter(h => h.dateCreated === key);
      const total = dayHabits.length;
      const done = dayHabits.filter(h => h.completed).length;
      const percentage = total ? Math.round(done / total * 100) : 0;

      const column = document.createElement("div");
      column.className = "flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2";
      column.innerHTML = `
        <span class="text-[10px] font-semibold text-slate-500 dark:text-slate-400">${percentage}%</span>
        <div class="flex h-24 w-full items-end overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800">
          <div class="w-full rounded-lg bg-indigo-500" style="height:${Math.max(percentage, 3)}%"></div>
        </div>
        <span class="text-[10px] text-slate-400">${formatDate(date, { weekday: "short" })}</span>
      `;
      chart.appendChild(column);
    }
  }

  function openModal() {
    $("#habitName").value = "";
    $("#habitEmoji").value = "💧";
    $("#formError").classList.add("hidden");
    updateChoiceStyles();
    $("#habitModal").classList.remove("hidden");
    $("#habitModal").classList.add("flex");
    setTimeout(() => $("#habitName").focus(), 30);
  }

  function closeModal() {
    $("#habitModal").classList.add("hidden");
    $("#habitModal").classList.remove("flex");
  }

  function updateChoiceStyles() {
    $$(".emojiChoice").forEach(button => {
      const selected = button.dataset.emoji === $("#habitEmoji").value;
      button.classList.toggle("border-indigo-500", selected);
      button.classList.toggle("bg-indigo-50", selected);
      button.classList.toggle("dark:bg-indigo-950", selected);
      button.classList.toggle("border-slate-200", !selected);
      button.classList.toggle("dark:border-slate-700", !selected);
    });
  }

  function handleSubmit(event) {
    event.preventDefault();
    const name = $("#habitName").value.trim();
    const error = $("#formError");

    if (!name) {
      error.textContent = "Please enter a task name.";
      error.classList.remove("hidden");
      return;
    }

    habits.unshift({
      id: window.crypto && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name,
      emoji: $("#habitEmoji").value,
      completed: false,
      dateCreated: dateKey(),
      timeSpent: 0
    });

    saveHabits();
    closeModal();
    render();
    showToast("Task added for today.");
  }

  function toggleHabit(id, checked) {
    const habit = habits.find(item => item.id === id);
    if (!habit) return;
    if (habit.dateCreated !== dateKey()) return;

    habit.completed = checked;
    
    if (checked && timerTaskId === id) {
      stopTimer(true);
    }

    saveHabits();
    render();
    
    if (checked && getTodayDoneCount() === getTodayTotalCount()) {
      showToast("All tasks completed for today! 🎉");
    }
  }

  function deleteHabit(id) {
    if (!confirm("Delete this task?")) return;
    if (timerTaskId === id) stopTimer(false);
    habits = habits.filter(item => item.id !== id);
    saveHabits();
    render();
    showToast("Task deleted.");
  }

  function startTimer(id) {
    if (timerTaskId && timerTaskId !== id) {
      showToast("Please stop the running timer first.");
      return;
    }
    
    const habit = habits.find(h => h.id === id);
    if (!habit) return;
    
    timerTaskId = id;
    timerSeconds = habit.timeSpent || 0;
    
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      timerSeconds++;
      const btn = document.querySelector(`[data-action="timer"][data-id="${id}"]`);
      if (btn) {
        btn.innerHTML = `⏸ ${formatTime(timerSeconds)}`;
      }
    }, 1000);
    
    renderHabits(); 
  }

  function stopTimer(save) {
    clearInterval(timerInterval);
    if (save && timerTaskId) {
      const habit = habits.find(h => h.id === timerTaskId);
      if (habit) {
        habit.timeSpent = timerSeconds;
        saveHabits();
      }
    }
    timerTaskId = null;
    timerSeconds = 0;
    renderHabits();
  }

  function requestNotificationPermission() {
    if (!("Notification" in window)) {
      showToast("This browser does not support desktop notification");
      return;
    }
    Notification.requestPermission().then(permission => {
      if (permission === "granted") {
        showToast("Notifications enabled! 🔔");
        $("#notifyBtn").classList.add("text-indigo-600", "border-indigo-300");
      } else {
        showToast("Notifications blocked.");
      }
    });
  }

  function checkNotifications() {
    if (Notification.permission !== "granted") return;
    
    const total = getTodayTotalCount();
    const done = getTodayDoneCount();
    const hour = new Date().getHours();
    
    if (hour >= 20 && total > done && !localStorage.getItem("notifiedToday_" + dateKey())) {
      new Notification("HabitFlow Reminder", {
        body: `You still have ${total - done} tasks to complete today!`,
        icon: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII="
      });
      localStorage.setItem("notifiedToday_" + dateKey(), "true");
    }
  }

  function applyTheme(theme) {
    const dark = theme === "dark";
    document.documentElement.classList.toggle("dark", dark);
    $("#themeBtn").textContent = dark ? "☀" : "☾";
    try { localStorage.setItem(THEME_KEY, dark ? "dark" : "light"); } catch (error) {}
  }

  function initTheme() {
    let theme = "light";
    try {
      theme = localStorage.getItem(THEME_KEY) || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    } catch (error) {}
    applyTheme(theme);
  }

  $("#addHabitBtn").addEventListener("click", openModal);
  $("#closeModalBtn").addEventListener("click", closeModal);
  $("#cancelModalBtn").addEventListener("click", closeModal);
  $("#habitForm").addEventListener("submit", handleSubmit);
  $("#filterSelect").addEventListener("change", renderHabits);
  $("#themeBtn").addEventListener("click", () => applyTheme(document.documentElement.classList.contains("dark") ? "light" : "dark"));
  $("#notifyBtn").addEventListener("click", requestNotificationPermission);

  $("#habitModal").addEventListener("click", event => { if (event.target === $("#habitModal")) closeModal(); });
  $("#emojiChoices").addEventListener("click", event => {
    const button = event.target.closest("[data-emoji]");
    if (!button) return;
    $("#habitEmoji").value = button.dataset.emoji;
    updateChoiceStyles();
  });

  $("#habitList").addEventListener("change", event => {
    const checkbox = event.target.closest('[data-action="toggle"]');
    if (checkbox) toggleHabit(checkbox.dataset.id, checkbox.checked);
  });

  $("#habitList").addEventListener("click", event => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const { action, id } = button.dataset;
    
    if (action === "delete") deleteHabit(id);
    if (action === "timer") {
      if (timerTaskId === id) stopTimer(true);
      else startTimer(id);
    }
  });

  $("#emptyState").addEventListener("click", event => {
    if (event.target.closest('[data-action="add"]')) openModal();
  });

  $$(".rangeBtn").forEach(button => {
    button.addEventListener("click", () => {
      activeRange = Number(button.dataset.range) === 30 ? 30 : 7;
      $$(".rangeBtn").forEach(item => {
        const selected = item === button;
        item.classList.toggle("bg-indigo-600", selected);
        item.classList.toggle("text-white", selected);
        item.classList.toggle("border", !selected);
        item.classList.toggle("border-slate-200", !selected);
        item.classList.toggle("dark:border-slate-700", !selected);
      });
      renderHabits();
      renderCalendar();
    });
  });

  initTheme();
  render();
  
  setInterval(checkNotifications, 5 * 60 * 1000);
  checkNotifications();
})();