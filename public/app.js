(() => {
  "use strict";

  const HERO_NAMES = { pip: "Pip", luna: "Luna", bruno: "Bruno", zaza: "Zaza" };
  const $ = (id) => document.getElementById(id);
  const state = {
    live: false, // server has an AI key
    offline: false, // this story uses the built-in fallback
    name: "", age: 5, hero: "pip",
    notes: { happened: "", felt: "", did: "" },
    plan: null,
    parts: [], // { text, options, chosen }
    busy: false,
    controller: null,
    run: 0, // bumped on "New story" so an offline story stops typing
  };

  // ---------- helpers ----------
  function show(screenId) {
    document.querySelectorAll(".screen").forEach((s) => { s.hidden = s.id !== screenId; });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  const heroName = () => HERO_NAMES[state.hero] || "the hero";
  const fill = (tpl) => tpl.replaceAll("{hero}", heroName());
  function setText(selector, value) {
    document.querySelectorAll(selector).forEach((el) => { el.textContent = value; });
  }
  function setMode() {
    const el = $("mode");
    el.hidden = false;
    const offline = state.offline || !state.live;
    el.textContent = offline ? "Offline story" : "Live";
    el.classList.toggle("live", !offline);
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------- 1. start ----------
  fetch("/api/config")
    .then((r) => r.json())
    .then((c) => { state.live = Boolean(c.live); })
    .catch(() => { state.live = false; })
    .finally(setMode);

  $("start-form").addEventListener("submit", (e) => {
    e.preventDefault();
    state.name = $("child-name").value.trim();
    state.age = Number($("child-age").value);
    state.hero = document.querySelector('input[name="hero"]:checked').value;
    setText(".js-child", state.name || "your child");
    setText(".js-hero", heroName());
    show("screen-day");
  });

  document.querySelectorAll("[data-back]").forEach((b) =>
    b.addEventListener("click", () => show(b.dataset.back)));

  // ---------- 2/3. day and plan ----------
  $("day-form").addEventListener("submit", (e) => {
    e.preventDefault();
    state.notes = {
      happened: $("happened").value.trim(),
      felt: $("felt").value.trim(),
      did: $("did").value.trim(),
    };
    state.plan = null;
    show("screen-plan");
    requestPlan();
  });

  $("change-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const change = $("change").value.trim();
    if (!change) return;
    requestPlan(change);
  });

  // Used only when there is no AI: the offline story is about sharing a toy, so notes
  // about something serious must not get it (SR-03). The check is in safety.js.
  const SAFETY_MESSAGE = "This sounds like something to talk through rather than turn into a story. Please talk to someone you trust, such as your doctor, a teacher or a local support service.";

  async function requestPlan(changeRequest) {
    const previous = state.plan;
    $("plan-card").hidden = true;
    $("plan-unsafe").hidden = true;
    $("plan-loading").hidden = false;
    let plan = null;
    let offline = !state.live;
    if (state.live) {
      try {
        const res = await fetch("/api/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            age: state.age, hero: state.hero, ...state.notes,
            previousPlan: changeRequest ? previous : undefined,
            changeRequest: changeRequest || undefined,
          }),
        });
        if (res.ok) plan = await res.json();
        else if (res.status === 503) offline = true;
        else {
          const body = await res.json().catch(() => ({}));
          return planError(body.error || "The story helper could not make a plan just now.", changeRequest, previous);
        }
      } catch {
        offline = true; // no network
      }
    }
    if (offline) {
      if (changeRequest) return planError("Changing the plan needs the internet. The offline story stays the same.", changeRequest, previous);
      await sleep(600);
      const notes = Object.values(state.notes).join(" ");
      plan = window.KidlySafety.isWorrying(notes) ? { safe: false, message: SAFETY_MESSAGE } : window.FALLBACK.plan;
    }
    state.offline = offline;
    setMode();
    $("plan-loading").hidden = true;
    if (plan.safe === false) {
      state.plan = null;
      return showUnsafe(plan.message);
    }
    renderPlan(plan);
  }

  function renderPlan(plan) {
    state.plan = plan;
    $("change").value = "";
    $("plan-title").textContent = plan.title || "Tonight's story";
    $("plan-theme").textContent = plan.theme;
    $("plan-lesson").textContent = plan.lesson;
    $("plan-setting").textContent = plan.setting;
    $("plan-echo").textContent = plan.echo;
    const ol = $("plan-choices");
    ol.replaceChildren(...plan.choices.map((c) => {
      const li = document.createElement("li");
      li.textContent = c;
      return li;
    }));
    $("plan-card").hidden = false;
  }

  // Shows a problem with a retry, and keeps the plan the parent already had.
  function planError(message, changeRequest, previous) {
    $("plan-loading").hidden = true;
    const box = $("plan-unsafe");
    const p = document.createElement("p");
    p.textContent = message;
    const retry = document.createElement("button");
    retry.className = "btn ghost";
    retry.type = "button";
    retry.textContent = "Try again";
    retry.addEventListener("click", () => requestPlan(changeRequest));
    box.replaceChildren(p, retry);
    box.hidden = false;
    if (previous) {
      renderPlan(previous);
      $("change").value = changeRequest || "";
    }
  }

  function showUnsafe(message) {
    $("plan-loading").hidden = true;
    const box = $("plan-unsafe");
    box.textContent = message;
    box.hidden = false;
  }

  // ---------- 5. story ----------
  $("approve").addEventListener("click", () => {
    if (!state.plan) return;
    state.parts = [];
    $("story-title").textContent = state.plan.title || "Tonight's story";
    $("ending").hidden = true;
    show("screen-story");
    renderStory();
    requestPart(0);
  });

  function renderStory() {
    const article = $("story");
    const nodes = [];
    state.parts.forEach((p) => {
      const para = document.createElement("p");
      para.textContent = p.text;
      nodes.push(para);
      if (p.chosen) {
        const c = document.createElement("p");
        c.className = "chosen";
        c.textContent = p.chosen;
        nodes.push(c);
      }
    });
    article.replaceChildren(...nodes);
  }

  function currentParagraph() {
    const paras = $("story").querySelectorAll("p:not(.chosen)");
    return paras[paras.length - 1];
  }

  function showChoices(options) {
    const box = $("choice-buttons");
    box.replaceChildren(...options.map((opt) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "choice";
      b.textContent = opt;
      b.addEventListener("click", () => choose(opt));
      return b;
    }));
    $("choices").hidden = false;
  }

  function updateBackButton() {
    $("go-back").hidden = state.busy || state.parts.length < 2;
  }

  function choose(option) {
    if (state.busy) return;
    const last = state.parts[state.parts.length - 1];
    last.chosen = option;
    $("choices").hidden = true;
    renderStory();
    requestPart(state.parts.length);
  }

  $("go-back").addEventListener("click", () => {
    if (state.busy || state.parts.length < 2) return;
    state.parts.pop();
    const last = state.parts[state.parts.length - 1];
    last.chosen = null;
    $("ending").hidden = true;
    $("story-error").hidden = true;
    renderStory();
    showChoices(last.options);
    updateBackButton();
  });

  $("restart").addEventListener("click", () => {
    state.controller?.abort();
    state.run += 1;
    $("day-form").reset();
    show("screen-day");
  });

  async function requestPart(index) {
    state.busy = true;
    updateBackButton();
    $("story-error").hidden = true;
    $("story-wait").hidden = false;
    const part = { text: "", options: [], chosen: null };
    state.parts.push(part);
    renderStory();
    try {
      if (state.offline || !state.live) await offlinePart(index, part);
      else await livePart(index, part);
    } catch (err) {
      if (err?.name === "AbortError") return;
      state.parts.pop();
      renderStory();
      const box = $("story-error");
      box.replaceChildren();
      const msg = document.createElement("p");
      msg.textContent = "The story got a bit sleepy. Let's try that part again.";
      const retry = document.createElement("button");
      retry.className = "btn primary";
      retry.textContent = "Try again";
      retry.addEventListener("click", () => requestPart(index));
      box.append(msg, retry);
      box.hidden = false;
    } finally {
      state.busy = false;
      $("story-wait").hidden = true;
      updateBackButton();
    }
  }

  function finishPart(index, part, payload) {
    if (index < 2) {
      part.options = payload.options;
      showChoices(part.options);
    } else {
      $("lesson").textContent = payload.lesson || state.plan.lesson;
      $("questions").replaceChildren(...(payload.questions || []).map((q) => {
        const li = document.createElement("li");
        li.textContent = q;
        return li;
      }));
      $("ending").hidden = false;
    }
  }

  async function livePart(index, part) {
    state.controller = new AbortController();
    const history = state.parts.slice(0, index).map((p) => ({ text: p.text, choice: p.chosen }));
    const res = await fetch("/api/story", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: state.controller.signal,
      body: JSON.stringify({
        age: state.age, hero: state.hero, ...state.notes,
        plan: state.plan, sig: state.plan.sig, approved: true, partIndex: index, history,
      }),
    });
    if (!res.ok || !res.body) throw new Error("HTTP " + res.status);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let done = false;
    const para = currentParagraph();
    while (!done) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buf += decoder.decode(chunk.value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        const msg = JSON.parse(line);
        if (msg.type === "text") {
          $("story-wait").hidden = true;
          part.text += msg.text;
          para.textContent = part.text.trimStart();
        } else if (msg.type === "reset") {
          part.text = "";
          para.textContent = "";
        } else if (msg.type === "options") {
          part.text = part.text.trim();
          finishPart(index, part, msg);
          done = true;
        } else if (msg.type === "end") {
          part.text = part.text.trim();
          finishPart(index, part, msg);
          done = true;
        } else if (msg.type === "error") {
          throw new Error(msg.error);
        }
      }
    }
    if (!done) throw new Error("Story stopped early");
  }

  // Types out the built-in story word by word so it feels the same as live.
  async function offlinePart(index, part) {
    const F = window.FALLBACK;
    let text, payload;
    if (index === 0) {
      text = F.parts[0].text;
      payload = { options: F.parts[0].options };
    } else if (index === 1) {
      const i = Math.max(0, F.parts[0].options.indexOf(state.parts[0].chosen));
      text = F.middles[i];
      payload = { options: F.secondOptions };
    } else {
      const i = Math.max(0, F.secondOptions.indexOf(state.parts[1].chosen));
      text = F.endings[i];
      payload = { lesson: F.lesson, questions: F.questions };
    }
    await sleep(500);
    $("story-wait").hidden = true;
    const para = currentParagraph();
    const words = fill(text).split(" ");
    const run = state.run;
    for (const w of words) {
      if (state.run !== run) {
        const err = new Error("stopped");
        err.name = "AbortError";
        throw err;
      }
      part.text += (part.text ? " " : "") + w;
      para.textContent = part.text;
      await sleep(35);
    }
    finishPart(index, part, payload);
  }
})();
