(() => {
  "use strict";

  const state = {
    client: null,
    data: null,
    extra: null,
    player: null,
    cardIndex: 0,
    groupIndex: 0,
    mode: "picker",
    soundEnabled: false,
    audioContext: null,
    music: null,
    musicKey: null,
    musicFadeTimer: null,
    transitionLock: false
  };

  const $ = (selector) => document.querySelector(selector);
  const elements = {
    loading: $("#recap-loading"),
    error: $("#recap-error"),
    errorMessage: $("#recap-error-message"),
    retry: $("#recap-retry"),
    picker: $("#recap-picker"),
    playerList: $("#recap-player-list"),
    groupButton: $("#open-group-recap"),
    deck: $("#recap-deck"),
    groupDeck: $("#group-deck"),
    progress: $("#recap-progress"),
    changePlayer: $("#change-player"),
    soundToggle: $("#sound-toggle"),
    prev: $("#prev-card"),
    next: $("#next-card"),
    groupPrev: $("#group-prev-card"),
    groupNext: $("#group-next-card")
  };

  const formatNumber = (value, digits = 0) =>
    new Intl.NumberFormat("nl-NL", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
      useGrouping: false
    })
      .format(Number(value ?? 0))
      .replace(",", ".");

  function formatDate(value, withYear = false) {
    if (!value) return "";
    return new Intl.DateTimeFormat("nl-NL", {
      day: "numeric",
      month: "long",
      ...(withYear ? { year: "numeric" } : {})
    }).format(new Date(`${value}T12:00:00`));
  }

  function hourLabel(hour) {
    const h = String(Number(hour)).padStart(2, "0");
    const next = String((Number(hour) + 1) % 24).padStart(2, "0");
    return `${h}.00–${next}.00`;
  }

  function ensureAudioContext() {
    if (!state.audioContext) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return null;
      state.audioContext = new AudioContext();
    }

    if (state.audioContext.state === "suspended") {
      state.audioContext.resume().catch(() => {});
    }

    return state.audioContext;
  }

  function softTone(frequency, duration = 0.16, volume = 0.025, delay = 0) {
    if (!state.soundEnabled) return;
    const ctx = ensureAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(frequency, now);
    osc.frequency.exponentialRampToValueAtTime(frequency * 1.08, now + duration);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  function playTransitionSound(direction = 1) {
    if (!state.soundEnabled) return;
    const base = direction > 0 ? 330 : 260;
    softTone(base, 0.15, 0.018, 0);
    softTone(base * 1.5, 0.18, 0.014, 0.06);
  }

  function playOpeningSound() {
    if (!state.soundEnabled) return;
    softTone(220, 0.28, 0.02, 0);
    softTone(330, 0.32, 0.018, 0.12);
    softTone(440, 0.36, 0.016, 0.24);
  }

  function playerMusicKey(name) {
    return String(name ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
  }

  function musicPath(key) {
    return `audio/${key}.mp3`;
  }

  function clearMusicFade() {
    if (state.musicFadeTimer) {
      clearInterval(state.musicFadeTimer);
      state.musicFadeTimer = null;
    }
  }

  function pauseMusic(reset = false) {
    clearMusicFade();

    if (!state.music) return;

    state.music.pause();

    if (reset) {
      try {
        state.music.currentTime = 0;
      } catch (_) {}
    }
  }

  function fadeOutMusic(callback) {
    clearMusicFade();

    if (!state.music || state.music.paused) {
      callback?.();
      return;
    }

    let volume = state.music.volume;
    const step = Math.max(0.02, volume / 10);

    state.musicFadeTimer = window.setInterval(() => {
      volume = Math.max(0, volume - step);
      state.music.volume = volume;

      if (volume <= 0.001) {
        clearMusicFade();
        state.music.pause();
        callback?.();
      }
    }, 35);
  }

  function playCurrentMusic(restart = false) {
    if (!state.soundEnabled || !state.music) return;

    clearMusicFade();

    if (restart) {
      try {
        state.music.currentTime = 0;
      } catch (_) {}
    }

    state.music.volume = 0.30;

    const promise = state.music.play();
    if (promise?.catch) {
      promise.catch((error) => {
        console.warn("Muziek kon niet automatisch starten:", error);
      });
    }
  }

  function setMusicTrack(key, restart = true) {
    if (!key) return;

    if (state.musicKey === key && state.music) {
      if (state.soundEnabled) playCurrentMusic(restart);
      return;
    }

    const startNewTrack = () => {
      clearMusicFade();

      if (state.music) {
        state.music.pause();
        state.music.src = "";
      }

      const music = new Audio(musicPath(key));
      music.loop = true;
      music.preload = "auto";
      music.volume = 0.30;

      music.addEventListener("error", () => {
        console.warn(`MP3 niet gevonden of niet afspeelbaar: ${musicPath(key)}`);
      });

      state.music = music;
      state.musicKey = key;

      if (state.soundEnabled) {
        playCurrentMusic(restart);
      }
    };

    if (state.music && !state.music.paused) {
      fadeOutMusic(startNewTrack);
    } else {
      startNewTrack();
    }
  }

  function stopMusicForPicker() {
    fadeOutMusic(() => {
      if (state.music) {
        try {
          state.music.currentTime = 0;
        } catch (_) {}
      }
    });
  }


  function updateSoundButton() {
    elements.soundToggle.textContent = state.soundEnabled ? "Geluid aan" : "Geluid uit";
    elements.soundToggle.setAttribute("aria-pressed", String(state.soundEnabled));
    elements.soundToggle.classList.toggle("sound-on", state.soundEnabled);
  }

  function toggleSound() {
    state.soundEnabled = !state.soundEnabled;
    localStorage.setItem("biercounter-recap-sound", state.soundEnabled ? "1" : "0");
    updateSoundButton();

    if (state.soundEnabled) {
      ensureAudioContext();
      playOpeningSound();

      if (state.music) {
        playCurrentMusic(false);
      } else if (state.mode === "player" && state.player) {
        setMusicTrack(playerMusicKey(state.player.name), true);
      } else if (state.mode === "group") {
        setMusicTrack("groep", true);
      }
    } else {
      pauseMusic(false);
    }
  }

  function animateCards(cards, oldIndex, newIndex, direction) {
    return new Promise((resolve) => {
      const oldCard = cards[oldIndex];
      const newCard = cards[newIndex];

      if (!oldCard || !newCard || oldCard === newCard) {
        resolve();
        return;
      }

      const leaveClass = direction > 0 ? "leaving-left" : "leaving-right";
      const enterClass = direction > 0 ? "entering-right" : "entering-left";

      newCard.classList.add("active", enterClass);
      oldCard.classList.add(leaveClass);

      requestAnimationFrame(() => {
        newCard.classList.add("transition-go");
        oldCard.classList.add("transition-go");
      });

      window.setTimeout(() => {
        oldCard.classList.remove("active", leaveClass, "transition-go");
        newCard.classList.remove(enterClass, "transition-go");
        resolve();
      }, 720);
    });
  }

  function showOnly(target) {
    [elements.loading, elements.error, elements.picker, elements.deck, elements.groupDeck]
      .forEach((el) => el.classList.add("hidden"));
    target.classList.remove("hidden");
  }

  function loadScript(url) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = url;
      script.async = true;
      script.onload = () => window.supabase?.createClient
        ? resolve()
        : reject(new Error("Supabase bibliotheek is niet beschikbaar."));
      script.onerror = () => reject(new Error("Supabase bibliotheek kon niet worden geladen."));
      document.head.appendChild(script);
    });
  }

  async function ensureSupabase() {
    if (window.supabase?.createClient) return;
    let lastError;
    for (const url of [
      "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
      "https://unpkg.com/@supabase/supabase-js@2"
    ]) {
      try {
        await loadScript(url);
        return;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError ?? new Error("Supabase bibliotheek kon niet worden geladen.");
  }

  async function ensureSession() {
    const sessionResult = await state.client.auth.getSession();
    if (sessionResult.error) throw sessionResult.error;
    if (sessionResult.data.session) return sessionResult.data.session.user;

    const anonymousResult = await state.client.auth.signInAnonymously();
    if (anonymousResult.error) throw anonymousResult.error;
    return anonymousResult.data.user;
  }

  async function loadRecap() {
    const [recapResult, extraResult] = await Promise.all([
      state.client.rpc("get_biercounter_recap"),
      state.client.rpc("get_biercounter_extra_stats")
    ]);

    if (recapResult.error) throw recapResult.error;
    if (extraResult.error) throw extraResult.error;

    state.data = recapResult.data;
    state.extra = extraResult.data;
  }

  async function currentMappedPlayer(user) {
    const { data, error } = await state.client
      .from("profiles")
      .select("player_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) return null;
    return state.data.players.find((player) => player.id === data?.player_id) ?? null;
  }

  function renderPicker() {
    stopMusicForPicker();
    elements.playerList.replaceChildren();

    [...state.data.players]
      .sort((a, b) => a.name.localeCompare(b.name, "nl"))
      .forEach((player) => {
        const button = document.createElement("button");
        button.className = "player-choice";
        button.type = "button";
        button.textContent = player.name;
        button.addEventListener("click", () => openPlayer(player));
        elements.playerList.appendChild(button);
      });

    state.mode = "picker";
    elements.changePlayer.classList.add("hidden");
    renderProgress(0, 0);
    showOnly(elements.picker);
  }

  function renderProgress(index, total) {
    elements.progress.replaceChildren();
    for (let i = 0; i < total; i += 1) {
      const dot = document.createElement("span");
      dot.className = `progress-dot${i === index ? " active" : ""}`;
      elements.progress.appendChild(dot);
    }
  }

  function renderSplit(container, values) {
    container.replaceChildren();
    values.forEach(({ label, value, icon }) => {
      const item = document.createElement("div");
      item.className = "split-item";
      item.innerHTML = `
        <span class="split-value">${icon} ${formatNumber(value)}</span>
        <span class="split-label">${label}</span>
      `;
      container.appendChild(item);
    });
  }

  function chartDateParts(value) {
    const date = new Date(`${value}T12:00:00`);
    const weekday = new Intl.DateTimeFormat("nl-NL", {
      weekday: "short"
    }).format(date).replace(".", "");

    return {
      weekday,
      date: `${date.getDate()}/${date.getMonth() + 1}`
    };
  }

  function renderBars(container, daily) {
    container.replaceChildren();
    const max = Math.max(1, ...daily.map((item) => Number(item.total)));
    const peak = Math.max(...daily.map((item) => Number(item.total)));

    daily.forEach((item) => {
      const column = document.createElement("div");
      column.className = `bar-column${Number(item.total) === peak ? " peak" : ""}`;

      const barArea = document.createElement("div");
      barArea.className = "bar-area";

      const bar = document.createElement("div");
      bar.className = "bar";
      bar.style.height = `${Math.max(2, (Number(item.total) / max) * 100)}%`;

      if (Number(item.total) === peak) {
        const label = document.createElement("span");
        label.className = "bar-label";
        label.textContent = item.total;
        barArea.appendChild(label);
      }

      const dateParts = chartDateParts(item.day);
      const dateLabel = document.createElement("div");
      dateLabel.className = "bar-date";
      dateLabel.innerHTML = `
        <span>${dateParts.weekday}</span>
        <strong>${dateParts.date}</strong>
      `;

      barArea.appendChild(bar);
      column.append(barArea, dateLabel);
      container.appendChild(column);
    });
  }

  function cratesForBeer(count) {
    const full = Math.floor(Number(count) / 20);
    const loose = Number(count) % 20;
    return { full, loose };
  }

  function crateLabel(count) {
    const { full, loose } = cratesForBeer(count);
    if (full === 0) return `${loose} losse flesjes`;
    if (loose === 0) return `${full} ${full === 1 ? "krat" : "kratten"}`;
    return `${full} ${full === 1 ? "krat" : "kratten"} + ${loose} losse`;
  }

  function extraForPlayer(player) {
    return state.extra?.players?.find((item) => item.id === player.id) ?? null;
  }

  function personalRecord(player) {
    const extra = extraForPlayer(player);

    if (!extra) {
      return {
        title: "Jouw eigen ritme",
        copy: `${formatNumber(player.avg_per_day, 1)} registraties per vakantiedag.`,
        detail: ""
      };
    }

    const records = {
      Alena: {
        title: "Grootste eindsprint",
        copy: `In de tweede helft kwamen er ${extra.half_change} registraties bij ten opzichte van de eerste helft.`,
        detail: `${extra.first_half} in de eerste helft, ${extra.second_half} in de tweede. De grootste positieve verschuiving van de groep.`
      },
      Jurjen: {
        title: "Nachtuil van de groep",
        copy: `${formatNumber(extra.night_pct, 1)}% van jouw registraties viel tussen 00.00 en 05.00.`,
        detail: `${extra.night_count} nachtelijke registraties. Het hoogste aandeel van iedereen.`
      },
      Mike: {
        title: "Kortste klik",
        copy: `Met ${extra.buddy_name} zat er gemiddeld maar ${extra.buddy_avg_seconds} seconden tussen jullie gekoppelde registraties.`,
        detail: `${extra.buddy_matches} keer binnen vijf minuten. Niemand zat gemiddeld dichter op zijn vaste drinkmaatje.`
      },
      Milan: {
        title: "02.00 was jouw uur",
        copy: `Jouw meest voorkomende tijdvak was 02.00–03.00.`,
        detail: `${player.favorite_hour_total} registraties vielen in dat uur.`
      },
      Niels: {
        title: "Meeste nachtwerk",
        copy: `${extra.night_count} registraties tussen 00.00 en 05.00.`,
        detail: `${formatNumber(extra.night_pct, 1)}% van jouw totaal. In absolute aantallen het meeste van de groep.`
      },
      Ramon: {
        title: "Meest in sync",
        copy: `Bij ${extra.buddy_matches} van jouw registraties zat ${extra.buddy_name} binnen vijf minuten.`,
        detail: `${formatNumber(player.buddy?.pct_of_entries ?? 0, 1)}% van jouw vakantie. Het hoogste aandeel van de groep.`
      },
      Rogier: {
        title: "De stille constante",
        copy: `Je dagtotalen bleven opvallend dicht bij elkaar.`,
        detail: `Van ${extra.min_day} op je rustigste dag tot ${extra.max_day} op je drukste. Alleen Rutger was nog gelijkmatiger.`
      },
      Rutger: {
        title: "Meest constante ritme",
        copy: `Jouw dagtotalen schommelden het minst van iedereen.`,
        detail: `Je laagste dag was ${extra.min_day}, je hoogste ${extra.max_day}.`
      },
      Yordan: {
        title: "Wildste dagritme",
        copy: `Bij niemand liepen rustige en drukke dagen verder uiteen.`,
        detail: `Van ${extra.min_day} op je rustigste dag tot ${extra.max_day} op je drukste, in slechts ${player.days_present} vakantiedagen.`
      }
    };

    return records[player.name] ?? {
      title: "Jouw opvallendste ritme",
      copy: `${extra.min_day} op je rustigste dag, ${extra.max_day} op je drukste.`,
      detail: `Je favoriete uur was ${hourLabel(extra.favorite_hour)}.`
    };
  }

  function compactRecord(player) {
    const extra = extraForPlayer(player);

    if (!extra) {
      return `${formatNumber(player.avg_per_day, 1)} per vakantiedag`;
    }

    const summaries = {
      Alena: `+${extra.half_change} in de tweede helft`,
      Jurjen: `${formatNumber(extra.night_pct, 1)}% tussen 00.00 en 05.00`,
      Mike: `${extra.buddy_avg_seconds} sec gemiddeld met ${extra.buddy_name}`,
      Milan: `${player.favorite_hour_total} registraties tussen 02.00 en 03.00`,
      Niels: `${extra.night_count} registraties tussen 00.00 en 05.00`,
      Ramon: `${extra.buddy_matches} keer binnen 5 min met ${extra.buddy_name}`,
      Rogier: `${extra.min_day}–${extra.max_day} per dag`,
      Rutger: `${extra.min_day}–${extra.max_day} per dag, kleinste schommeling`,
      Yordan: `${extra.min_day}–${extra.max_day} per dag in ${player.days_present} dagen`
    };

    return summaries[player.name] ?? `${extra.min_day}–${extra.max_day} per dag`;
  }

  function renderGroupRecords() {
    const list = $("#group-records-list");
    list.replaceChildren();

    [...state.data.players]
      .sort((a, b) => Number(a.rank) - Number(b.rank))
      .forEach((player) => {
        const record = personalRecord(player);
        const row = document.createElement("div");
        row.className = "group-record-row";

        const name = document.createElement("strong");
        name.className = "group-record-name";
        name.textContent = player.name;

        const text = document.createElement("div");
        text.className = "group-record-text";

        const title = document.createElement("span");
        title.className = "group-record-title";
        title.textContent = record.title;

        const detail = document.createElement("span");
        detail.className = "group-record-detail";
        detail.textContent = compactRecord(player);

        text.append(title, detail);
        row.append(name, text);
        list.appendChild(row);
      });
  }

  function hasPreviousHistory(player) {
    return (player.history ?? []).some((item) => Number(item.year) < 2026);
  }

  function renderCareer(player) {
    const careerGrid = $("#career-grid");
    careerGrid.replaceChildren();

    const allHistory = player.history ?? [];
    const years = allHistory.filter((item) => item.category === "beer");
    const minYear = Math.min(...allHistory.map((item) => Number(item.year)));
    const maxYear = Math.max(...allHistory.map((item) => Number(item.year)));

    if (player.history_category !== "beer" || years.length === 0) {
      const total = allHistory.reduce((sum, item) => sum + Number(item.count ?? 0), 0);

      $("#career-title").textContent =
        minYear === maxYear ? `${player.name}, ${maxYear}` : `${player.name}, ${minYear}–${maxYear}`;

      const stats = [
        [formatNumber(total), "registraties in bekende vakanties"],
        [formatNumber(allHistory.length), "vakanties vastgelegd"]
      ];

      stats.forEach(([value, label]) => {
        const item = document.createElement("div");
        item.className = "career-stat";
        item.innerHTML = `<strong>${value}</strong><span>${label}</span>`;
        careerGrid.appendChild(item);
      });

      $("#career-note").textContent = "";
      return;
    }

    const beer500Years = years.filter((item) => Number(item.beer_ml) === 500);
    const beer250Years = years.filter((item) => Number(item.beer_ml) === 250);
    const count500 = beer500Years.reduce((sum, item) => sum + Number(item.count ?? 0), 0);
    const count250 = beer250Years.reduce((sum, item) => sum + Number(item.count ?? 0), 0);
    const totalLiters = years.reduce((sum, item) => sum + Number(item.liters ?? 0), 0);
    const totalBeer = years.reduce((sum, item) => sum + Number(item.count ?? 0), 0);

    $("#career-title").textContent =
      minYear === maxYear ? `${player.name}, ${maxYear}` : `${player.name}, ${minYear}–${maxYear}`;

    const stats = [
      [formatNumber(totalBeer), "bier totaal"],
      [`${formatNumber(totalLiters, totalLiters % 1 ? 2 : 0)} L`, "biervolume totaal"]
    ];

    if (count500 > 0) {
      stats.push([crateLabel(count500), "500 ml-jaren"]);
    }

    if (count250 > 0) {
      stats.push([`${formatNumber(count250)} × 250 ml`, "Frankrijk 2025"]);
    }

    stats.forEach(([value, label]) => {
      const item = document.createElement("div");
      item.className = "career-stat";
      item.innerHTML = `<strong>${value}</strong><span>${label}</span>`;
      careerGrid.appendChild(item);
    });

    $("#career-note").textContent = "";
  }

  function bestHistoryInsight(player) {
    const history = player.history ?? [];
    if (history.length < 2) {
      return "Jouw eerste jaar in de historische Biercounter vergelijking.";
    }

    if (player.history_category === "beer") {
      const byCount = [...history].filter(x => x.category === "beer").sort((a, b) => b.count - a.count);
      const byLiters = [...history].filter(x => x.liters !== null).sort((a, b) => b.liters - a.liters);
      const countWinner = byCount[0];
      const literWinner = byLiters[0];

      if (countWinner?.year !== literWinner?.year) {
        return `${countWinner.year} had je meeste biertjes, maar ${literWinner.year} was je grootste jaar in liters.`;
      }

      if (literWinner) {
        return `${literWinner.year} was jouw grootste Biercounter vakantie, met ${formatNumber(literWinner.liters, literWinner.liters % 1 ? 1 : 0)} liter bier.`;
      }
    }

    const byCount = [...history].sort((a, b) => b.count - a.count);
    return `${byCount[0].year} was jouw hoogste geregistreerde vakantie, met ${formatNumber(byCount[0].count)} drankjes.`;
  }

  function renderHistory(player) {
    const list = $("#history-list");
    list.replaceChildren();

    player.history.forEach((year) => {
      const row = document.createElement("div");
      row.className = "history-year";

      const result = year.category === "beer"
        ? `${formatNumber(year.count)} bier`
        : `${formatNumber(year.count)} drankjes`;

      let detail = year.note ?? "";
      if (year.category === "beer" && year.liters !== null) {
        detail = `${formatNumber(year.liters, year.liters % 1 ? 2 : 0)} L`;
        if (Number(year.beer_ml) === 500) {
          detail += ` · ${crateLabel(year.count)}`;
        }
      }

      row.innerHTML = `
        <strong>${year.year}</strong>
        <div class="history-place">
          ${year.vacation_name}
          <span>${year.year === 2025 && year.category === "beer" ? "250 ml per bier" : year.category === "beer" ? "500 ml per bier" : "wijn / cocktails"}</span>
        </div>
        <div class="history-result">
          ${result}
          <small>${detail}</small>
        </div>
      `;
      list.appendChild(row);
    });

    $("#history-title").textContent =
      player.history_category === "beer"
        ? "Aantal én volume tellen."
        : "Jouw geregistreerde vakanties.";

    $("#history-insight").textContent = bestHistoryInsight(player);
  }

  function openPlayer(player) {
    state.player = player;
    state.cardIndex = 0;
    state.mode = "player";

    $("#intro-name").textContent = player.name;
    $("#intro-subtitle").textContent = `${player.days_present} dagen. ${player.total} registraties. Eén laatste Recap.`;

    $("#total-number").textContent = formatNumber(player.total);
    renderSplit($("#drink-split"), [
      { label: "bier", value: player.bier, icon: "🍺" },
      { label: "wijn", value: player.wijn, icon: "🍷" },
      { label: "cocktail", value: player.cocktail, icon: "🍹" }
    ]);

    $("#rank-number").textContent = `#${player.rank}`;
    $("#rank-copy").textContent = `van ${player.player_count} spelers`;
    $("#rank-share").textContent = `${formatNumber(player.group_share_pct, 1)}% van alle registraties kwam van jou.`;

    const attendanceNote = $("#attendance-note");
    if (player.days_present < 15) {
      attendanceNote.textContent =
        `Je was ${player.days_present} dagen mee, van ${formatDate(player.attendance_start)} tot en met ${formatDate(player.attendance_end)}.`;
      attendanceNote.classList.remove("hidden");
    } else {
      attendanceNote.classList.add("hidden");
    }

    $("#avg-per-day").textContent = formatNumber(player.avg_per_day, 1);
    $("#days-present").textContent = formatNumber(player.days_present);
    $("#peak-day-copy").textContent =
      `${formatDate(player.peak_day)} was jouw drukste dag, met ${player.peak_day_total} registraties.`;
    $("#favorite-hour-copy").textContent =
      `Je meest voorkomende uur was ${hourLabel(player.favorite_hour)}, met ${player.favorite_hour_total} registraties.`;

    if (player.buddy) {
      $("#buddy-name").textContent = player.buddy.name;
      $("#buddy-copy").textContent =
        `Bij ${player.buddy.matched_entries} van jouw registraties noteerde ${player.buddy.name} binnen vijf minuten ook iets.`;
      $("#buddy-detail").textContent =
        `Dat is ${formatNumber(player.buddy.pct_of_entries, 1)}% van jouw vakantie. Gemiddeld zat er ${player.buddy.avg_seconds_apart} seconden tussen.`;
    } else {
      $("#buddy-name").textContent = "Geen match";
      $("#buddy-copy").textContent = "Er was geen vaste combinatie binnen vijf minuten.";
      $("#buddy-detail").textContent = "";
    }

    renderBars($("#daily-chart"), player.daily);

    renderHistory(player);

    const showPreviousYears = hasPreviousHistory(player);
    const historyCard = elements.deck.querySelector('[data-card="history"]');
    const careerCard = elements.deck.querySelector('[data-card="career"]');
    historyCard?.classList.toggle("excluded", !showPreviousYears);
    careerCard?.classList.toggle("excluded", !showPreviousYears);

    const record = personalRecord(player);
    $("#record-title").textContent = record.title;
    $("#record-copy").textContent = record.copy;
    $("#record-detail").textContent = record.detail;

    renderCareer(player);

    $("#final-name").textContent = player.name;
    const finalStats = $("#final-stats");
    finalStats.replaceChildren();

    const finalValues = [
      [`#${player.rank}`, "eindpositie"],
      [formatNumber(player.total), "registraties"],
      [formatNumber(player.avg_per_day, 1), "per dag"],
      [player.buddy?.name ?? "—", "drinkmaatje"]
    ];

    if (player.history_category === "beer") {
      finalValues.push([`${formatNumber(player.bier * .5, player.bier % 2 ? 1 : 0)} L`, "bier in 2026"]);
    } else {
      finalValues.push([`${player.cocktail} 🍹`, "cocktails in 2026"]);
    }

    finalValues.forEach(([value, label]) => {
      const item = document.createElement("div");
      item.className = "final-stat";
      item.innerHTML = `<strong>${value}</strong><span>${label}</span>`;
      finalStats.appendChild(item);
    });

    elements.changePlayer.classList.remove("hidden");
    showOnly(elements.deck);
    updatePlayerCard();
    setMusicTrack(playerMusicKey(player.name), true);
    playOpeningSound();
  }

  function playerCards() {
    return [...elements.deck.querySelectorAll(".story-card:not(.excluded)")];
  }

  function updatePlayerCard() {
    const allCards = [...elements.deck.querySelectorAll(".story-card")];
    const cards = playerCards();

    allCards.forEach((card) => card.classList.remove("active"));
    cards[state.cardIndex]?.classList.add("active");

    elements.prev.disabled = state.cardIndex === 0;
    elements.next.textContent = state.cardIndex === cards.length - 1 ? "Klaar" : "Volgende";
    renderProgress(state.cardIndex, cards.length);
  }

  function renderGroupHistory() {
    const list = $("#group-history");
    list.replaceChildren();

    state.data.historical_group.forEach((year) => {
      const row = document.createElement("div");
      row.className = "history-year";
      row.innerHTML = `
        <strong>${year.year}</strong>
        <div class="history-place">
          ${year.vacation_name}
          <span>${year.year === 2025 ? "250 ml per bier" : "500 ml per bier"}</span>
        </div>
        <div class="history-result">
          ${formatNumber(year.beer_count)} bier
          <small>${formatNumber(year.beer_liters, year.beer_liters % 1 ? 2 : 0)} L${year.year === 2025 ? "" : ` · ${crateLabel(year.beer_count)}`}</small>
        </div>
      `;
      list.appendChild(row);
    });
  }

  function openGroup() {
    state.mode = "group";
    state.groupIndex = 0;
    const summary = state.data.summary;

    $("#group-total").textContent = formatNumber(summary.total_entries);
    renderSplit($("#group-split"), [
      { label: "bier", value: summary.bier, icon: "🍺" },
      { label: "wijn", value: summary.wijn, icon: "🍷" },
      { label: "cocktail", value: summary.cocktail, icon: "🍹" }
    ]);

    $("#group-liters").textContent = formatNumber(summary.beer_liters, 1);
    $("#group-beer-detail").textContent =
      `${formatNumber(summary.bier)} biertjes × 500 ml · ${crateLabel(summary.bier)}`;

    const cocktailLiters = Number(summary.cocktail) * 0.33;
    $("#group-cocktail-liters").textContent = formatNumber(cocktailLiters, 2);
    $("#group-cocktail-detail").textContent =
      `${formatNumber(summary.cocktail)} Frisco flesjes × 330 ml`;

    const buddy = summary.top_buddy_pair;
    $("#group-buddy").textContent = `${buddy.player_a} + ${buddy.player_b}`;
    $("#group-buddy-copy").textContent =
      `Geen combinatie zat vaker binnen vijf minuten van elkaar in de registratie.`;

    renderBars($("#group-daily-chart"), state.data.group_daily);
    $("#group-peak-copy").textContent =
      `${formatDate(summary.peak_day)} was de drukste dag met ${summary.peak_day_total} registraties. Het drukste uur was ${hourLabel(summary.favorite_hour)}.`;

    const groupMoment = state.extra?.group_moment;
    if (groupMoment) {
      const momentDate = new Date(groupMoment.timestamp);
      const momentDay = new Intl.DateTimeFormat("nl-NL", {
        day: "numeric",
        month: "long"
      }).format(momentDate);
      const momentTime = new Intl.DateTimeFormat("nl-NL", {
        hour: "2-digit",
        minute: "2-digit"
      }).format(momentDate);

      $("#group-moment-title").textContent =
        `${groupMoment.unique_players} van ${summary.player_count} spelers binnen vijf minuten.`;
      $("#group-moment-copy").textContent =
        `Op ${momentDay} rond ${momentTime} registreerde de hele groep vrijwel tegelijk.`;
    }

    renderGroupRecords();
    renderGroupHistory();

    elements.changePlayer.classList.remove("hidden");
    showOnly(elements.groupDeck);
    updateGroupCard();
    setMusicTrack("groep", true);
    playOpeningSound();
  }

  function updateGroupCard() {
    const cards = [...elements.groupDeck.querySelectorAll(".story-card")];
    cards.forEach((card, index) => card.classList.toggle("active", index === state.groupIndex));
    elements.groupPrev.disabled = state.groupIndex === 0;
    elements.groupNext.textContent = state.groupIndex === cards.length - 1 ? "Klaar" : "Volgende";
    renderProgress(state.groupIndex, cards.length);
  }

  async function nextPlayerCard(direction) {
    if (state.transitionLock) return;

    const cards = playerCards();

    if (direction > 0 && state.cardIndex === cards.length - 1) {
      renderPicker();
      return;
    }

    const oldIndex = state.cardIndex;
    const newIndex = Math.max(0, Math.min(cards.length - 1, oldIndex + direction));
    if (newIndex === oldIndex) return;

    state.transitionLock = true;
    playTransitionSound(direction);

    state.cardIndex = newIndex;
    renderProgress(state.cardIndex, cards.length);
    elements.prev.disabled = state.cardIndex === 0;
    elements.next.textContent = state.cardIndex === cards.length - 1 ? "Klaar" : "Volgende";

    await animateCards(cards, oldIndex, newIndex, direction);
    state.transitionLock = false;
  }

  async function nextGroupCard(direction) {
    if (state.transitionLock) return;

    const cards = [...elements.groupDeck.querySelectorAll(".story-card")];

    if (direction > 0 && state.groupIndex === cards.length - 1) {
      renderPicker();
      return;
    }

    const oldIndex = state.groupIndex;
    const newIndex = Math.max(0, Math.min(cards.length - 1, oldIndex + direction));
    if (newIndex === oldIndex) return;

    state.transitionLock = true;
    playTransitionSound(direction);

    state.groupIndex = newIndex;
    renderProgress(state.groupIndex, cards.length);
    elements.groupPrev.disabled = state.groupIndex === 0;
    elements.groupNext.textContent = state.groupIndex === cards.length - 1 ? "Klaar" : "Volgende";

    await animateCards(cards, oldIndex, newIndex, direction);
    state.transitionLock = false;
  }

  async function initialise() {
    showOnly(elements.loading);

    try {
      if (!window.APP_CONFIG?.SUPABASE_URL || !window.APP_CONFIG?.SUPABASE_KEY) {
        throw new Error("Supabase configuratie ontbreekt.");
      }

      await ensureSupabase();

      state.client = window.supabase.createClient(
        window.APP_CONFIG.SUPABASE_URL,
        window.APP_CONFIG.SUPABASE_KEY,
        {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
          }
        }
      );

      const user = await ensureSession();
      await loadRecap();
      const mapped = await currentMappedPlayer(user);

      renderPicker();

      if (mapped) {
        const mappedButton = [...elements.playerList.children]
          .find((button) => button.textContent === mapped.name);
        if (mappedButton) mappedButton.textContent = `${mapped.name} · jij`;
      }
    } catch (error) {
      console.error(error);
      elements.errorMessage.textContent = error?.message ?? "Onbekende fout.";
      showOnly(elements.error);
    }
  }

  state.soundEnabled = localStorage.getItem("biercounter-recap-sound") === "1";
  updateSoundButton();

  elements.soundToggle.addEventListener("click", toggleSound);

  elements.retry.addEventListener("click", initialise);
  elements.groupButton.addEventListener("click", openGroup);
  elements.changePlayer.addEventListener("click", renderPicker);
  const resumeSoundFromGesture = () => {
    if (!state.soundEnabled) return;
    ensureAudioContext();

    if (state.music?.paused) {
      playCurrentMusic(false);
    }
  };

  elements.prev.addEventListener("click", () => {
    resumeSoundFromGesture();
    nextPlayerCard(-1);
  });
  elements.next.addEventListener("click", () => {
    resumeSoundFromGesture();
    nextPlayerCard(1);
  });
  elements.groupPrev.addEventListener("click", () => {
    resumeSoundFromGesture();
    nextGroupCard(-1);
  });
  elements.groupNext.addEventListener("click", () => {
    resumeSoundFromGesture();
    nextGroupCard(1);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight") {
      if (state.mode === "player") nextPlayerCard(1);
      if (state.mode === "group") nextGroupCard(1);
    }
    if (event.key === "ArrowLeft") {
      if (state.mode === "player") nextPlayerCard(-1);
      if (state.mode === "group") nextGroupCard(-1);
    }
  });

  initialise();
})();
