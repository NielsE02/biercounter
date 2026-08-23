(() => {
  "use strict";

  const RECENT_LIMIT = 50;

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
    scores: [],
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
    ].forEach((element) => element?.classList.add("hidden"));

    screen?.classList.remove("hidden");
  }

  function setMessage(element, text, isError = false) {
    if (!element) return;
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

  function loadExternalScript(url) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = url;
      script.async = true;
      script.onload = () =>
        window.supabase?.createClient
          ? resolve()
          : reject(new Error("Supabase bibliotheek is niet beschikbaar."));
      script.onerror = () =>
        reject(new Error("Supabase bibliotheek kon niet worden geladen."));
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
      }
    }

    throw lastError ?? new Error("Supabase bibliotheek kon niet worden geladen.");
  }

  function showConnectionError(error) {
    console.error(error);
    const message = String(error?.message ?? error ?? "");
    elements.connectionErrorMessage.textContent =
      message || "Er ging iets mis bij het verbinden met Supabase.";
    showOnly(elements.errorScreen);
  }

  async function ensureSession() {
    const { data: sessionData, error: sessionError } =
      await state.client.auth.getSession();

    if (sessionError) throw sessionError;

    if (sessionData.session) {
      state.user = sessionData.session.user;
      return;
    }

    const { data, error } = await state.client.auth.signInAnonymously();
    if (error) throw error;
    state.user = data.user;
  }

  async function determineAdminStatus() {
    const { data, error } = await state.client.rpc("is_admin");
    if (error) throw error;
    state.isAdmin = data === true;
  }

  async function loadPlayers(includeInactive = false) {
    let query = state.client
      .from("players")
      .select("id, name, active, created_at")
      .order("name", { ascending: true });

    if (!includeInactive) query = query.eq("active", true);

    const { data, error } = await query;
    if (error) throw error;
    state.players = data ?? [];
  }

  async function loadCurrentPlayer() {
    const { data, error } = await state.client
      .from("profiles")
      .select("player_id, players(id, name, active)")
      .eq("user_id", state.user.id)
      .maybeSingle();

    if (error) throw error;

    const player = data?.players;
    state.currentPlayer =
      player && player.active
        ? { id: player.id, name: player.name }
        : null;
  }

  async function loadScores() {
    const { data, error } = await state.client.rpc("get_scoreboard");
    if (error) throw error;
    state.scores = data ?? [];
  }

  async function loadRecentDrinks() {
    const { data, error } = await state.client
      .from("drinks")
      .select("id, player_id, owner_user_id, drink_type, created_at, players(name)")
      .order("created_at", { ascending: false })
      .limit(RECENT_LIMIT);

    if (error) throw error;
    state.drinks = data ?? [];
  }

  async function loadPlayerApp() {
    await Promise.all([loadPlayers(false), loadCurrentPlayer()]);

    if (!state.currentPlayer) {
      renderPlayerPicker();
      showOnly(elements.playerScreen);
      elements.switchPlayerButton.classList.add("hidden");
      return;
    }

    renderDrinkButtons();
    elements.currentPlayerName.textContent = state.currentPlayer.name;
    elements.currentPlayerTotal.textContent = "…";
    showOnly(elements.appScreen);
    elements.switchPlayerButton.classList.remove("hidden");

    try {
      await Promise.all([loadScores(), loadRecentDrinks()]);
      renderPlayerView();
    } catch (error) {
      setMessage(
        elements.actionMessage,
        "De stand of recente geschiedenis kon niet volledig laden. Probeer Vernieuwen.",
        true
      );
      console.error(error);
    }
  }

  async function loadAdminApp() {
    await loadPlayers(true);
    renderAdminPlayers();
    showOnly(elements.adminScreen);
    elements.switchPlayerButton.classList.add("hidden");

    try {
      await loadRecentDrinks();
      renderHistory(elements.adminHistoryList, true);
    } catch (error) {
      setMessage(elements.adminMessage, "Recente invoer kon niet laden.", true);
      console.error(error);
    }
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
      setMessage(elements.actionMessage, `Toevoegen is niet gelukt. ${error.message}`, true);
      return;
    }

    const drink = getDrinkType(drinkType);
    setMessage(elements.actionMessage, `${drink.label} toegevoegd`);

    await Promise.all([loadScores(), loadRecentDrinks()]);
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

    if (fromAdmin) {
      await loadRecentDrinks();
      renderHistory(elements.adminHistoryList, true);
    } else {
      await Promise.all([loadScores(), loadRecentDrinks()]);
      renderPlayerView();
    }
  }

  function renderPlayerView() {
    elements.currentPlayerName.textContent = state.currentPlayer.name;

    const score = state.scores.find(
      (row) => row.player_id === state.currentPlayer.id
    );

    elements.currentPlayerTotal.textContent = String(score?.total ?? 0);

    renderScoreboard();
    renderHistory(elements.historyList, false);
    elements.historyEmpty.classList.toggle("hidden", state.drinks.length > 0);
  }

  function renderScoreboard() {
    elements.scoreboard.replaceChildren();

    state.scores.forEach((row, index) => {
      const item = document.createElement("li");
      item.className = "score-row";

      const position = document.createElement("span");
      position.className = "score-position";
      position.textContent = String(index + 1);

      const name = document.createElement("span");
      name.className = "score-name";
      name.textContent = row.name;

      const count = document.createElement("span");
      count.className = "score-count";
      count.textContent = String(row.total ?? 0);

      item.append(position, name, count);
      elements.scoreboard.appendChild(item);
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

      const mayDelete = fromAdmin || entry.owner_user_id === state.user.id;

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

    setMessage(elements.adminMessage, active ? "Speler geactiveerd" : "Speler verborgen");
    await loadPlayers(true);
    renderAdminPlayers();
  }

  async function handleAddPlayer(event) {
    event.preventDefault();
    const name = normaliseName(elements.newPlayerName.value);
    if (!name) return;

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
      setMessage(elements.adminLoginMessage, "Dit account heeft geen beheerdersrechten.", true);
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
    const confirmation = window.prompt("Typ WISSEN om alle scores te verwijderen.");
    if (confirmation !== "WISSEN") return;

    const { error } = await state.client.from("drinks").delete().gte("id", 0);

    if (error) {
      setMessage(elements.adminMessage, error.message, true);
      return;
    }

    setMessage(elements.adminMessage, "Alle scores zijn gewist");
    state.drinks = [];
    renderHistory(elements.adminHistoryList, true);
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
          try {
            if (state.isAdmin) {
              await loadRecentDrinks();
              renderHistory(elements.adminHistoryList, true);
            } else if (state.currentPlayer) {
              await Promise.all([loadScores(), loadRecentDrinks()]);
              renderPlayerView();
            }
          } catch (error) {
            console.error(error);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "players" },
        async () => {
          try {
            await loadPlayers(state.isAdmin);

            if (state.isAdmin) {
              renderAdminPlayers();
            } else if (!state.currentPlayer) {
              renderPlayerPicker();
            } else {
              await loadScores();
              renderPlayerView();
            }
          } catch (error) {
            console.error(error);
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

      if (!state.client) {
        const { SUPABASE_URL, SUPABASE_KEY } = window.APP_CONFIG;
        state.client = window.supabase.createClient(
          SUPABASE_URL,
          SUPABASE_KEY,
          {
            auth: {
              persistSession: true,
              autoRefreshToken: true,
              detectSessionInUrl: true
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

  bindEvents();
  initialise();
})();
