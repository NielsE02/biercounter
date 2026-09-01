(() => {
  "use strict";

  const state = {
    client: null,
    data: null,
    extra: null,
    player: null,
    cardIndex: 0,
    groupIndex: 0,
    mode: "picker"
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

    if (extra.night_rank === 1) {
      return {
        title: "Nachtuil van de groep",
        copy: `${formatNumber(extra.night_pct, 1)}% van jouw registraties viel tussen 00.00 en 05.00.`,
        detail: `${extra.night_count} registraties na middernacht. Het hoogste aandeel van iedereen.`
      };
    }

    if (extra.consistency_rank === 1) {
      return {
        title: "Meest constante ritme",
        copy: "Jouw dagen lagen dichter bij elkaar dan die van alle andere spelers.",
        detail: `Je laagste dag was ${extra.min_day}, je hoogste ${extra.max_day}.`
      };
    }

    if (extra.night_rank === 2) {
      return {
        title: "Bijna altijd nachtwerk",
        copy: `${formatNumber(extra.night_pct, 1)}% van jouw registraties viel tussen 00.00 en 05.00.`,
        detail: `${extra.night_count} nachtelijke registraties in ${player.days_present} dagen.`
      };
    }

    if (extra.buddy_avg_seconds !== null && Number(extra.buddy_avg_seconds) <= 65) {
      return {
        title: "Strakste timing",
        copy: `Met ${extra.buddy_name} zat er gemiddeld maar ${extra.buddy_avg_seconds} seconden tussen jullie gekoppelde registraties.`,
        detail: `${extra.buddy_matches} keer binnen vijf minuten.`
      };
    }

    if (Number(extra.favorite_hour) === 2) {
      return {
        title: "02.00 was jouw uur",
        copy: "Jouw meest voorkomende tijdvak was 02.00–03.00.",
        detail: "Daar vielen meer van jouw registraties dan in ieder ander uur."
      };
    }

    if (Number(extra.half_change) >= 7) {
      return {
        title: "Sterke tweede helft",
        copy: `In de tweede helft registreerde je ${extra.half_change} drankjes meer dan in de eerste helft.`,
        detail: `${extra.first_half} in de eerste helft, ${extra.second_half} in de tweede.`
      };
    }

    if (Number(extra.half_change) <= -15) {
      return {
        title: "Vroege piek",
        copy: "De eerste helft van jouw vakantie lag duidelijk hoger.",
        detail: `${extra.first_half} registraties in de eerste helft tegenover ${extra.second_half} in de tweede.`
      };
    }

    if (extra.night_count_rank <= 3) {
      return {
        title: "Veel na middernacht",
        copy: `${extra.night_count} registraties tussen 00.00 en 05.00.`,
        detail: `Dat was ${formatNumber(extra.night_pct, 1)}% van jouw totaal.`
      };
    }

    return {
      title: "Jouw opvallendste ritme",
      copy: `${extra.min_day} op je rustigste dag, ${extra.max_day} op je drukste.`,
      detail: `Je favoriete uur was ${hourLabel(extra.favorite_hour)}.`
    };
  }

  function renderCareer(player) {
    const years = (player.history ?? []).filter((item) => item.category === "beer");
    const careerGrid = $("#career-grid");
    careerGrid.replaceChildren();

    const beer500Years = years.filter((item) => Number(item.beer_ml) === 500);
    const beer250Years = years.filter((item) => Number(item.beer_ml) === 250);

    const count500 = beer500Years.reduce((sum, item) => sum + Number(item.count ?? 0), 0);
    const count250 = beer250Years.reduce((sum, item) => sum + Number(item.count ?? 0), 0);
    const liters250 = beer250Years.reduce((sum, item) => sum + Number(item.liters ?? 0), 0);

    if (player.history_category !== "beer" || years.length === 0) {
      $("#career-title").textContent = "Jouw geregistreerde jaren";
      const total = (player.history ?? []).reduce((sum, item) => sum + Number(item.count ?? 0), 0);
      careerGrid.innerHTML = `
        <div class="career-stat">
          <strong>${formatNumber(total)}</strong>
          <span>registraties over alle bekende vakanties</span>
        </div>
        <div class="career-stat">
          <strong>${player.history?.length ?? 0}</strong>
          <span>vakanties vastgelegd</span>
        </div>
      `;
      $("#career-note").textContent = "Geen liter- of kratomrekening voor wijn en cocktails.";
      return;
    }

    const totalLiters = years.reduce((sum, item) => sum + Number(item.liters ?? 0), 0);
    const totalBeer = years.reduce((sum, item) => sum + Number(item.count ?? 0), 0);

    const stats = [
      [formatNumber(totalBeer), "bier in alle bekende jaren"],
      [`${formatNumber(totalLiters, totalLiters % 1 ? 2 : 0)} L`, "totaal biervolume"],
      [crateLabel(count500), "500 ml-bier omgerekend"],
      [formatNumber(count250), "250 ml-bier in 2025"]
    ];

    stats.forEach(([value, label]) => {
      const item = document.createElement("div");
      item.className = "career-stat";
      item.innerHTML = `<strong>${value}</strong><span>${label}</span>`;
      careerGrid.appendChild(item);
    });

    $("#career-title").textContent = `${player.name}, 2023–2026`;
    $("#career-note").textContent =
      count250 > 0
        ? `2025 blijft apart: ${formatNumber(count250)} × 250 ml = ${formatNumber(liters250, liters250 % 1 ? 2 : 0)} liter.`
        : "Alle bekende biertjes waren 500 ml.";
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
  }

  function updatePlayerCard() {
    const cards = [...elements.deck.querySelectorAll(".story-card")];
    cards.forEach((card, index) => card.classList.toggle("active", index === state.cardIndex));
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

    renderGroupHistory();

    elements.changePlayer.classList.remove("hidden");
    showOnly(elements.groupDeck);
    updateGroupCard();
  }

  function updateGroupCard() {
    const cards = [...elements.groupDeck.querySelectorAll(".story-card")];
    cards.forEach((card, index) => card.classList.toggle("active", index === state.groupIndex));
    elements.groupPrev.disabled = state.groupIndex === 0;
    elements.groupNext.textContent = state.groupIndex === cards.length - 1 ? "Klaar" : "Volgende";
    renderProgress(state.groupIndex, cards.length);
  }

  function nextPlayerCard(direction) {
    const cards = elements.deck.querySelectorAll(".story-card");
    if (direction > 0 && state.cardIndex === cards.length - 1) {
      renderPicker();
      return;
    }
    state.cardIndex = Math.max(0, Math.min(cards.length - 1, state.cardIndex + direction));
    updatePlayerCard();
  }

  function nextGroupCard(direction) {
    const cards = elements.groupDeck.querySelectorAll(".story-card");
    if (direction > 0 && state.groupIndex === cards.length - 1) {
      renderPicker();
      return;
    }
    state.groupIndex = Math.max(0, Math.min(cards.length - 1, state.groupIndex + direction));
    updateGroupCard();
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

  elements.retry.addEventListener("click", initialise);
  elements.groupButton.addEventListener("click", openGroup);
  elements.changePlayer.addEventListener("click", renderPicker);
  elements.prev.addEventListener("click", () => nextPlayerCard(-1));
  elements.next.addEventListener("click", () => nextPlayerCard(1));
  elements.groupPrev.addEventListener("click", () => nextGroupCard(-1));
  elements.groupNext.addEventListener("click", () => nextGroupCard(1));

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
