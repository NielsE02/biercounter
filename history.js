(() => {
  "use strict";

  const PAGE_SIZE = 100;

  const DRINK_TYPES = {
    bier: { label: "Bier", icon: "🍺" },
    wijn: { label: "Wijn", icon: "🍷" },
    cocktail: { label: "Cocktail", icon: "🍹" }
  };

  const state = {
    client: null,
    user: null,
    isAdmin: false,
    players: [],
    items: [],
    offset: 0,
    hasMore: true,
    loading: false
  };

  const elements = {
    loading: document.querySelector("#history-loading"),
    error: document.querySelector("#history-error"),
    errorMessage: document.querySelector("#history-error-message"),
    retry: document.querySelector("#history-retry"),
    screen: document.querySelector("#history-screen"),
    list: document.querySelector("#full-history-list"),
    empty: document.querySelector("#full-history-empty"),
    loadMore: document.querySelector("#load-more-history"),
    playerFilter: document.querySelector("#history-player-filter"),
    drinkFilter: document.querySelector("#history-drink-filter"),
    orderFilter: document.querySelector("#history-order-filter"),
    count: document.querySelector("#history-count")
  };

  function show(target) {
    [elements.loading, elements.error, elements.screen].forEach((el) =>
      el.classList.add("hidden")
    );
    target.classList.remove("hidden");
  }

  function hasConfiguration() {
    const config = window.APP_CONFIG ?? {};
    return Boolean(config.SUPABASE_URL && config.SUPABASE_KEY);
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

    for (const url of [
      "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
      "https://unpkg.com/@supabase/supabase-js@2"
    ]) {
      try {
        await loadExternalScript(url);
        return;
      } catch (error) {
        console.warn(error);
      }
    }

    throw new Error("Supabase bibliotheek kon niet worden geladen.");
  }

  function formatTime(value) {
    return new Intl.DateTimeFormat("nl-NL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(value));
  }

  async function ensureSession() {
    const { data, error } = await state.client.auth.getSession();
    if (error) throw error;

    if (data.session) {
      state.user = data.session.user;
      return;
    }

    const result = await state.client.auth.signInAnonymously();
    if (result.error) throw result.error;
    state.user = result.data.user;
  }

  async function determineAdminStatus() {
    const { data, error } = await state.client.rpc("is_admin");
    if (error) throw error;
    state.isAdmin = data === true;
  }

  async function loadPlayers() {
    const { data, error } = await state.client
      .from("players")
      .select("id, name")
      .order("name", { ascending: true });

    if (error) throw error;
    state.players = data ?? [];

    elements.playerFilter.innerHTML = '<option value="">Alle spelers</option>';
    state.players.forEach((player) => {
      const option = document.createElement("option");
      option.value = player.id;
      option.textContent = player.name;
      elements.playerFilter.appendChild(option);
    });
  }

  function buildQuery() {
    const from = state.offset;
    const to = from + PAGE_SIZE - 1;

    let query = state.client
      .from("drinks")
      .select("id, player_id, owner_user_id, drink_type, created_at, players(name)")
      .order("created_at", { ascending: elements.orderFilter.value === "asc" })
      .range(from, to);

    if (elements.playerFilter.value) {
      query = query.eq("player_id", elements.playerFilter.value);
    }

    if (elements.drinkFilter.value) {
      query = query.eq("drink_type", elements.drinkFilter.value);
    }

    return query;
  }

  async function loadPage(reset = false) {
    if (state.loading) return;

    state.loading = true;
    elements.loadMore.disabled = true;

    try {
      if (reset) {
        state.offset = 0;
        state.items = [];
        state.hasMore = true;
        elements.list.replaceChildren();
      }

      const { data, error } = await buildQuery();
      if (error) throw error;

      const rows = data ?? [];
      state.items.push(...rows);
      state.offset += rows.length;
      state.hasMore = rows.length === PAGE_SIZE;

      rows.forEach(renderItem);

      elements.empty.classList.toggle("hidden", state.items.length > 0);
      elements.loadMore.classList.toggle("hidden", !state.hasMore);
      elements.count.textContent = `${state.items.length} geladen`;
    } catch (error) {
      console.error(error);
      elements.errorMessage.textContent =
        error?.message || "Er ging iets mis bij het laden.";
      show(elements.error);
    } finally {
      state.loading = false;
      elements.loadMore.disabled = false;
    }
  }

  function renderItem(entry) {
    const item = document.createElement("article");
    item.className = "history-item";

    const main = document.createElement("div");
    main.className = "history-main";

    const drink = DRINK_TYPES[entry.drink_type] ?? {
      label: entry.drink_type,
      icon: "🥤"
    };

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
      state.isAdmin || entry.owner_user_id === state.user.id;

    if (mayDelete) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "icon-button";
      button.setAttribute("aria-label", "Invoer verwijderen");
      button.textContent = "×";
      button.addEventListener("click", async () => {
        button.disabled = true;

        const { error } = await state.client
          .from("drinks")
          .delete()
          .eq("id", entry.id);

        if (error) {
          button.disabled = false;
          alert(`Verwijderen is niet gelukt. ${error.message}`);
          return;
        }

        await loadPage(true);
      });

      item.appendChild(button);
    }

    elements.list.appendChild(item);
  }

  async function initialise() {
    show(elements.loading);

    try {
      if (!hasConfiguration()) {
        throw new Error("Supabase is nog niet ingesteld.");
      }

      await ensureSupabaseLibrary();

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

      await ensureSession();
      await determineAdminStatus();
      await loadPlayers();

      show(elements.screen);
      await loadPage(true);
    } catch (error) {
      console.error(error);
      elements.errorMessage.textContent =
        error?.message || "Er ging iets mis bij het laden.";
      show(elements.error);
    }
  }

  elements.retry.addEventListener("click", initialise);
  elements.loadMore.addEventListener("click", () => loadPage(false));

  [
    elements.playerFilter,
    elements.drinkFilter,
    elements.orderFilter
  ].forEach((element) => {
    element.addEventListener("change", () => loadPage(true));
  });

  initialise();
})();
