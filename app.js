(() => {
  "use strict";

  const DRINK_TYPES = [
    { key: "bier", label: "Bier", icon: "🍺" },
    { key: "wijn", label: "Wijn", icon: "🍷" },
    { key: "cocktail", label: "Cocktail", icon: "🍹" }
  ];

  const state = {
    client: null,
    user: null,
    isAdmin: false,
    currentPlayer: null,
    players: [],
    drinks: [],
    channel: null
  };

  const elements = {
    setupScreen: document.querySelector("#setup-screen"),
    loadingScreen: document.querySelector("#loading-screen"),
    errorScreen: document.querySelector("#error-screen"),
    connectionErrorMessage: document.querySelector("#connection-error-message"),
    retryButton: document.querySelector("#retry-button"),
    playerScreen: document.querySelector("#player-screen"),
    appScreen: document.querySelector("#app-screen"),
    adminLoginScreen: document.querySelector("#admin-login-screen"),
    adminScreen: document.querySelector("#admin-screen"),
    playerList: document.querySelector("#player-list"),
    playerEmpty: document.querySelector("#player-empty"),
    currentPlayerName: document.querySelector("#current-player-name"),
    currentPlayerTotal: document.querySelector("#current-player-total"),
    drinkButtons: document.querySelector("#drink-buttons"),
    scoreboard: document.querySelector("#scoreboard"),
    historyList: document.querySelector("#history-list"),
    historyEmpty: document.querySelector("#history-empty"),
    actionMessage: document.querySelector("#action-message"),
    switchPlayerButton: document.querySelector("#switch-player-button"),
    adminButton: document.querySelector("#admin-button"),
    refreshButton: document.querySelector("#refresh-button"),
    adminLoginForm: document.querySelector("#admin-login-form"),
    adminEmail: document.querySelector("#admin-email"),
    adminPassword: document.querySelector("#admin-password"),
    adminLoginMessage: document.querySelector("#admin-login-message"),
    cancelAdminLogin: document.querySelector("#cancel-admin-login"),
    adminLogoutButton: document.querySelector("#admin-logout-button"),
    addPlayerForm: document.querySelector("#add-player-form"),
    newPlayerName: document.querySelector("#new-player-name"),
    adminMessage: document.querySelector("#admin-message"),
    adminPlayerList: document.querySelector("#admin-player-list"),
    resetScoresButton: document.querySelector("#reset-scores-button"),
    adminHistoryList: document.querySelector("#admin-history-list"),
    drinkButtonTemplate: document.querySelector("#drink-button-template")
  };

  const REQUEST_TIMEOUT_MS = 15000;
  const SUPABASE_SCRIPT_TIMEOUT_MS = 10000;

  function fetchWithTimeout(input, init = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);

    if (init.signal) {
      if (init.signal.aborted) {
        controller.abort();
      } else {
        init.signal.addEventListener("abort", () => controller.abort(), { once: true });
      }
    }

    return fetch(input, {
      ...init,
      signal: controller.signal
    }).finally(() => window.clearTimeout(timer));
  }

  function loadExternalScript(url, timeoutMs = SUPABASE_SCRIPT_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      let finished = false;

      const done = (callback, value) => {
        if (finished) return;
        finished = true;
        window.clearTimeout(timer);
        script.onload = null;
        script.onerror = null;
        callback(value);
      };

      const timer = window.setTimeout(() => {
        script.remove();
        done(reject, new Error("Supabase bibliotheek laden duurde te lang."));
      }, timeoutMs);

      script.src = url;
      script.async = true;

      script.onload = () => {
        if (window.supabase?.createClient) {
          done(resolve);
        } else {
          script.remove();
          done(reject, new Error("Supabase bibliotheek is niet beschikbaar."));
        }
      };

      script.onerror = () => {
        script.remove();
        done(reject, new Error("Supabase bibliotheek kon niet worden geladen."));
      };

      document.head.appendChild(script);
    });
  }

  async function ensureSupabaseLibrary() {
    if (window.supabase?.createClient) return;

    const sources = [
      "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
      "https://unpkg.com/@supabase/supabase-js@2"
    ];

    let lastError = null;

    for (const source of sources) {
      try {
        await loadExternalScript(source);
        return;
      } catch (error) {
        lastError = error;
        console.warn("Supabase laden mislukt", source, error);
      }
    }

    throw lastError ?? new Error("Supabase bibliotheek kon niet worden geladen.");
  }

  function friendlyConnectionMessage(error) {
    const raw = String(error?.message ?? error ?? "");
    const lower = raw.toLowerCase();

    if (
      raw.includes("Failed to fetch") ||
      raw.includes("Load failed") ||
      raw.includes("Network request failed") ||
      lower.includes("abort") ||
      lower.includes("duurde te lang")
    ) {
      return "De verbinding met Supabase lukte niet binnen 15 seconden. Tik op Opnieuw proberen. Blijft dit gebeuren, controleer dan de Supabase instellingen.";
    }

    if (
      lower.includes("anonymous") ||
      lower.includes("rate limit") ||
      raw.includes("429")
    ) {
      return "Supabase weigert de nieuwe sessie. Controleer bij Authentication of Anonymous aanstaat en controleer de Rate Limits.";
    }

    return raw ? `Er ging iets mis. ${raw}` : "Er ging iets mis bij het verbinden met Supabase.";
  }

  function showConnectionError(error) {
    console.error(error);
    elements.connectionErrorMessage.textContent = friendlyConnectionMessage(error);
    showOnly(elements.errorScreen);
  }

  function hasConfiguration() {
    const config = window.APP_CONFIG ?? {};
    return Boolean(
      config.SUPABASE_URL &&
      config.SUPABASE_KEY &&
      !config.SUPABASE_URL.includes("JOUW-PROJECT") &&
      !config.SUPABASE_KEY.includes("JOUW-PUBLISHABLE-KEY")
    );
  }

  function showOnly(screen) {
    [
      elements.setupScreen,
      elements.loadingScreen,
      elements.errorScreen,
      elements.playerScreen,
      elements.appScreen,
      elements.adminLoginScreen,
      elements.adminScreen
    ].forEach((element) => element.classList.add("hidden"));

    screen.classList.remove("hidden");
  }

  function setMessage(element, text, isError = false) {
    element.textContent = text;
    element.classList.toggle("error", isError);
  }

  function normaliseName(name) {
    return name.trim().replace(/\s+/g, " ");
  }

  function getDrinkType(key) {
    return DRINK_TYPES.find((drink) => drink.key === key) ?? {
      key,
      label: key,
      icon: "🥤"
    };
  }

  function formatTime(isoString) {
    return new Intl.DateTimeFormat("nl-NL", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(isoString));
  }

  async function ensureSession() {
    const { data: sessionData, error: sessionError } =
      await state.client.auth.getSession();

    if (sessionError) {
      throw sessionError;
    }

    if (sessionData.session) {
      state.user = sessionData.session.user;
      return;
    }

    const { data, error } = await state.client.auth.signInAnonymously();

    if (error) {
      throw error;
    }

    state.user = data.user;
  }

  async function determineAdminStatus() {
    const { data, error } = await state.client.rpc("is_admin");

    if (error) {
      throw error;
    }

    state.isAdmin = data === true;
  }

  async function loadPlayers(includeInactive = false) {
    let query = state.client
      .from("players")
      .select("id, name, active, created_at")
      .order("name", { ascending: true });

    if (!includeInactive) {
      query = query.eq("active", true);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    state.players = data ?? [];
  }

  async function loadCurrentPlayer() {
    const { data, error } = await state.client
      .from("profiles")
      .select("player_id, players(id, name, active)")
      .eq("user_id", state.user.id)
      .maybeSingle();

    if (error) {
      throw error;
    }

    const player = data?.players;

    state.currentPlayer =
      player && player.active
        ? { id: player.id, name: player.name }
        : null;
  }

  async function loadDrinks() {
    const { data, error } = await state.client
      .from("drinks")
      .select("id, player_id, owner_user_id, drink_type, created_at, players(name)")
      .order("created_at", { ascending: false })
      .limit(2000);

    if (error) {
      throw error;
    }

    state.drinks = data ?? [];
  }

  async function loadPlayerApp() {
    await Promise.all([loadPlayers(false), loadCurrentPlayer(), loadDrinks()]);

    if (!state.currentPlayer) {
      renderPlayerPicker();
      showOnly(elements.playerScreen);
      elements.switchPlayerButton.classList.add("hidden");
      return;
    }

    renderDrinkButtons();
    renderPlayerView();
    showOnly(elements.appScreen);
    elements.switchPlayerButton.classList.remove("hidden");
  }

  async function loadAdminApp() {
    await Promise.all([loadPlayers(true), loadDrinks()]);
    renderAdminView();
    showOnly(elements.adminScreen);
    elements.switchPlayerButton.classList.add("hidden");
  }

  function renderPlayerPicker() {
    elements.playerList.replaceChildren();
    elements.playerEmpty.classList.toggle("hidden", state.players.length > 0);

    state.players.forEach((player) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "player-card";
      button.textContent = player.name;
      button.addEventListener("click", () => choosePlayer(player));
      elements.playerList.appendChild(button);
    });
  }

  async function choosePlayer(player) {
    showOnly(elements.loadingScreen);

    const { error } = await state.client.from("profiles").upsert(
      {
        user_id: state.user.id,
        player_id: player.id,
        updated_at: new Date().toISOString()
      },
      { onConflict: "user_id" }
    );

    if (error) {
      showOnly(elements.playerScreen);
      alert(`Naam kiezen is niet gelukt. ${error.message}`);
      return;
    }

    state.currentPlayer = { id: player.id, name: player.name };
    await loadPlayerApp();
  }

  function renderDrinkButtons() {
    elements.drinkButtons.replaceChildren();

    DRINK_TYPES.forEach((drink) => {
      const fragment = elements.drinkButtonTemplate.content.cloneNode(true);
      const button = fragment.querySelector(".drink-button");

      fragment.querySelector(".drink-icon").textContent = drink.icon;
      fragment.querySelector(".drink-label").textContent = drink.label;

      button.addEventListener("click", async () => {
        button.disabled = true;
        await addDrink(drink.key);
        button.disabled = false;
      });

      elements.drinkButtons.appendChild(fragment);
    });
  }

  async function addDrink(drinkType) {
    setMessage(elements.actionMessage, "");

    const { error } = await state.client.from("drinks").insert({
      player_id: state.currentPlayer.id,
      owner_user_id: state.user.id,
      drink_type: drinkType
    });

    if (error) {
      setMessage(
        elements.actionMessage,
        `Toevoegen is niet gelukt. ${error.message}`,
        true
      );
      return;
    }

    const drink = getDrinkType(drinkType);
    setMessage(elements.actionMessage, `${drink.label} toegevoegd`);
    await loadDrinks();
    renderPlayerView();
  }

  async function deleteDrink(drinkId, fromAdmin = false) {
    const { error } = await state.client
      .from("drinks")
      .delete()
      .eq("id", drinkId);

    if (error) {
      const target = fromAdmin ? elements.adminMessage : elements.actionMessage;
      setMessage(target, `Verwijderen is niet gelukt. ${error.message}`, true);
      return;
    }

    await loadDrinks();

    if (fromAdmin) {
      renderAdminView();
    } else {
      renderPlayerView();
    }
  }

  function renderPlayerView() {
    elements.currentPlayerName.textContent = state.currentPlayer.name;

    const totals = new Map(state.players.map((player) => [player.id, 0]));

    state.drinks.forEach((drink) => {
      totals.set(drink.player_id, (totals.get(drink.player_id) ?? 0) + 1);
    });

    elements.currentPlayerTotal.textContent =
      totals.get(state.currentPlayer.id) ?? 0;

    renderScoreboard(totals);
    renderHistory(elements.historyList, false);
    elements.historyEmpty.classList.toggle("hidden", state.drinks.length > 0);
  }

  function renderScoreboard(totals) {
    elements.scoreboard.replaceChildren();

    const sortedPlayers = [...state.players].sort((a, b) => {
      const scoreDifference = (totals.get(b.id) ?? 0) - (totals.get(a.id) ?? 0);
      return scoreDifference || a.name.localeCompare(b.name, "nl");
    });

    sortedPlayers.forEach((player, index) => {
      const row = document.createElement("li");
      row.className = "score-row";

      const position = document.createElement("span");
      position.className = "score-position";
      position.textContent = String(index + 1);

      const name = document.createElement("span");
      name.className = "score-name";
      name.textContent = player.name;

      const count = document.createElement("span");
      count.className = "score-count";
      count.textContent = String(totals.get(player.id) ?? 0);

      row.append(position, name, count);
      elements.scoreboard.appendChild(row);
    });
  }

  function renderHistory(container, fromAdmin) {
    container.replaceChildren();

    state.drinks.forEach((entry) => {
      const item = document.createElement("article");
      item.className = "history-item";

      const main = document.createElement("div");
      main.className = "history-main";

      const drink = getDrinkType(entry.drink_type);

      const icon = document.createElement("span");
      icon.className = "history-icon";
      icon.textContent = drink.icon;

      const text = document.createElement("div");

      const title = document.createElement("div");
      title.className = "history-title";
      title.textContent = `${entry.players?.name ?? "Onbekend"} · ${drink.label}`;

      const meta = document.createElement("div");
      meta.className = "history-meta";
      meta.textContent = formatTime(entry.created_at);

      text.append(title, meta);
      main.append(icon, text);
      item.appendChild(main);

      const mayDelete =
        fromAdmin ||
        entry.owner_user_id === state.user.id;

      if (mayDelete) {
        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "icon-button";
        deleteButton.setAttribute("aria-label", "Invoer verwijderen");
        deleteButton.textContent = "×";
        deleteButton.addEventListener("click", () =>
          deleteDrink(entry.id, fromAdmin)
        );
        item.appendChild(deleteButton);
      }

      container.appendChild(item);
    });
  }

  function renderAdminView() {
    renderAdminPlayers();
    renderHistory(elements.adminHistoryList, true);
  }

  function renderAdminPlayers() {
    elements.adminPlayerList.replaceChildren();

    state.players.forEach((player) => {
      const item = document.createElement("div");
      item.className = "admin-item";

      const text = document.createElement("div");

      const name = document.createElement("div");
      name.className = "admin-item-name";
      name.textContent = player.name;

      const meta = document.createElement("div");
      meta.className = "admin-item-meta";
      meta.textContent = player.active ? "Actief" : "Verborgen";

      text.append(name, meta);

      const button = document.createElement("button");
      button.type = "button";
      button.className = player.active
        ? "button button-quiet"
        : "button button-primary";
      button.textContent = player.active ? "Verbergen" : "Activeren";
      button.addEventListener("click", () =>
        updatePlayerStatus(player.id, !player.active)
      );

      item.append(text, button);
      elements.adminPlayerList.appendChild(item);
    });
  }

  async function updatePlayerStatus(playerId, active) {
    const { error } = await state.client
      .from("players")
      .update({ active })
      .eq("id", playerId);

    if (error) {
      setMessage(elements.adminMessage, error.message, true);
      return;
    }

    setMessage(
      elements.adminMessage,
      active ? "Speler geactiveerd" : "Speler verborgen"
    );
    await loadPlayers(true);
    renderAdminPlayers();
  }

  async function handleAddPlayer(event) {
    event.preventDefault();
    const name = normaliseName(elements.newPlayerName.value);

    if (!name) {
      return;
    }

    const { error } = await state.client.from("players").insert({ name });

    if (error) {
      setMessage(elements.adminMessage, error.message, true);
      return;
    }

    elements.newPlayerName.value = "";
    setMessage(elements.adminMessage, `${name} toegevoegd`);
    await loadPlayers(true);
    renderAdminPlayers();
  }

  async function handleAdminLogin(event) {
    event.preventDefault();
    setMessage(elements.adminLoginMessage, "");

    const email = elements.adminEmail.value.trim();
    const password = elements.adminPassword.value;

    const { data, error } = await state.client.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      setMessage(
        elements.adminLoginMessage,
        "Inloggen is niet gelukt. Controleer je e-mail en wachtwoord.",
        true
      );
      return;
    }

    state.user = data.user;
    await determineAdminStatus();

    if (!state.isAdmin) {
      await state.client.auth.signOut();
      state.user = null;
      await ensureSession();
      await determineAdminStatus();
      setMessage(
        elements.adminLoginMessage,
        "Dit account heeft geen beheerdersrechten.",
        true
      );
      return;
    }

    elements.adminPassword.value = "";
    await loadAdminApp();
  }

  async function handleAdminLogout() {
    showOnly(elements.loadingScreen);
    await state.client.auth.signOut();
    state.user = null;
    state.isAdmin = false;
    state.currentPlayer = null;
    await ensureSession();
    await determineAdminStatus();
    await loadPlayerApp();
  }

  async function resetScores() {
    const confirmation = window.prompt(
      'Typ WISSEN om alle scores te verwijderen.'
    );

    if (confirmation !== "WISSEN") {
      return;
    }

    const { error } = await state.client
      .from("drinks")
      .delete()
      .gte("id", 0);

    if (error) {
      setMessage(elements.adminMessage, error.message, true);
      return;
    }

    setMessage(elements.adminMessage, "Alle scores zijn gewist");
    await loadDrinks();
    renderAdminView();
  }

  async function openAdmin() {
    if (state.isAdmin) {
      await loadAdminApp();
      return;
    }

    elements.adminEmail.value = "";
    elements.adminPassword.value = "";
    setMessage(elements.adminLoginMessage, "");
    showOnly(elements.adminLoginScreen);
  }

  async function switchPlayer() {
    state.currentPlayer = null;
    await loadPlayers(false);
    renderPlayerPicker();
    showOnly(elements.playerScreen);
    elements.switchPlayerButton.classList.add("hidden");
  }

  async function refreshCurrentView() {
    if (state.isAdmin) {
      await loadAdminApp();
    } else {
      await loadPlayerApp();
    }
  }

  function subscribeToChanges() {
    if (state.channel) {
      state.client.removeChannel(state.channel);
    }

    state.channel = state.client
      .channel("vakantieteller-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "drinks" },
        async () => {
          await loadDrinks();

          if (state.isAdmin) {
            renderAdminView();
          } else if (state.currentPlayer) {
            renderPlayerView();
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "players" },
        async () => {
          await loadPlayers(state.isAdmin);

          if (state.isAdmin) {
            renderAdminPlayers();
          } else if (!state.currentPlayer) {
            renderPlayerPicker();
          } else {
            renderPlayerView();
          }
        }
      )
      .subscribe();
  }

  function bindEvents() {
    elements.adminButton.addEventListener("click", openAdmin);
    elements.cancelAdminLogin.addEventListener("click", loadPlayerApp);
    elements.adminLoginForm.addEventListener("submit", handleAdminLogin);
    elements.adminLogoutButton.addEventListener("click", handleAdminLogout);
    elements.addPlayerForm.addEventListener("submit", handleAddPlayer);
    elements.resetScoresButton.addEventListener("click", resetScores);
    elements.switchPlayerButton.addEventListener("click", switchPlayer);
    elements.refreshButton.addEventListener("click", refreshCurrentView);
    elements.retryButton.addEventListener("click", initialise);
  }

  async function initialise() {
    showOnly(elements.loadingScreen);

    if (!hasConfiguration()) {
      showOnly(elements.setupScreen);
      return;
    }

    try {
      await ensureSupabaseLibrary();

      const { SUPABASE_URL, SUPABASE_KEY } = window.APP_CONFIG;

      if (!state.client) {
        state.client = window.supabase.createClient(
          SUPABASE_URL,
          SUPABASE_KEY,
          {
            auth: {
              persistSession: true,
              autoRefreshToken: true,
              detectSessionInUrl: true
            },
            global: {
              fetch: (input, init) =>
                fetchWithTimeout(input, init, REQUEST_TIMEOUT_MS)
            }
          }
        );
      }

      await ensureSession();
      await determineAdminStatus();

      if (state.isAdmin) {
        await loadAdminApp();
      } else {
        await loadPlayerApp();
      }

      subscribeToChanges();
    } catch (error) {
      showConnectionError(error);
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  bindEvents();
  initialise();
})();
