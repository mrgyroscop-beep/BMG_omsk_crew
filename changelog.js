(() => {
  "use strict";

  const SEEN_VERSION_KEY = "bmg-release-notes-seen-v1";
  const RELEASES = Object.freeze([
    {
      version: "0.12.0",
      date: "2026-09-29",
      title: {
        ru: "Поиск моделей и история обновлений",
        en: "Model search and update history",
      },
      summary: {
        ru: "В каталоге карточек появился быстрый поиск моделей, а после обновления приложение покажет главное из новой версии.",
        en: "The card catalog now has fast model search, and the app highlights what changed after an update.",
      },
      items: [
        {
          ru: "В разделе «Карточки → Модели» доступны поиск и быстрые фильтры по рангу и наличию файла для печати.",
          en: "Cards → Models now includes search plus quick rank and printable-file filters.",
        },
        {
          ru: "Уведомление о главных изменениях появляется только один раз для каждой новой версии.",
          en: "The update highlights appear only once for each new version.",
        },
        {
          ru: "Полную историю изменений можно открыть кнопкой в меню с шестерёнкой.",
          en: "The full changelog is available from the gear menu.",
        },
      ],
    },
    {
      version: "0.11.3",
      date: "2026-09-29",
      title: { ru: "Ссылки внутри правил стали интерактивными", en: "Rules references are now interactive" },
      summary: {
        ru: "Трейты, правила и статусы внутри описаний открываются во всплывающих окнах с возвратом к предыдущей статье.",
        en: "Traits, rules, and statuses inside descriptions open in popups that return to the previous entry.",
      },
      items: [
        { ru: "Вложенные статьи открываются в том же окне.", en: "Nested entries open in the same dialog." },
        { ru: "Закрытие возвращает к предыдущему описанию.", en: "Closing returns to the previous description." },
      ],
    },
    {
      version: "0.11.2",
      date: "2026-09-28",
      title: { ru: "Исправлен Funding от трейтов", en: "Trait Funding calculations fixed" },
      summary: {
        ru: "Бонусы Business Agent, Dirty Money, Lord of Business, Millionaire, Public Resources и Bat Credit Card корректно участвуют в проверке ростера.",
        en: "Business Agent, Dirty Money, Lord of Business, Millionaire, Public Resources, and Bat Credit Card now affect roster validation correctly.",
      },
      items: [
        { ru: "Учитываются бонусы босса и собственный бонус добавляемой модели.", en: "Boss bonuses and the added model's own bonus are both counted." },
      ],
    },
    {
      version: "0.11.1",
      date: "2026-09-28",
      title: { ru: "Выбор темы в настройках", en: "Theme selection in Settings" },
      summary: {
        ru: "Между классической темой и «Неоновым нуаром» можно переключаться без перезагрузки.",
        en: "Switch between the Classic and Neon Noir themes without reloading.",
      },
      items: [
        { ru: "Выбранное оформление сохраняется между запусками.", en: "The selected appearance is saved between sessions." },
      ],
    },
    {
      version: "0.11.0",
      date: "2026-09-28",
      title: { ru: "Неоновый нуар", en: "Neon Noir" },
      summary: {
        ru: "Приложение получило новую холодную неоновую тему, обновлённые поверхности, элементы управления и атмосферные фоны.",
        en: "The app gained a cool neon theme, refreshed surfaces and controls, and atmospheric backgrounds.",
      },
      items: [
        { ru: "Отдельные фоны добавлены для меню, каталогов, лобби и игрового экрана.", en: "Dedicated backgrounds were added for the menu, catalogs, lobby, and game screen." },
      ],
    },
    {
      version: "0.10.3",
      date: "2026-09-26",
      title: { ru: "Ростер соперника защищён от изменений", en: "Opponent roster is read-only" },
      summary: {
        ru: "На игровом экране нельзя менять раны, оглушение, активации, Audacity, усилия, эффекты, счётчики и карты целей соперника.",
        en: "Opponent damage, stun, activations, Audacity, effort, effects, counters, and objective cards can no longer be edited.",
      },
      items: [],
    },
    {
      version: "0.10.2",
      date: "2026-09-26",
      title: { ru: "Одиночный запуск матча", en: "Solo match launch" },
      summary: {
        ru: "Игру можно начать без комнаты и подключённого соперника; в одиночном режиме виден только собственный ростер.",
        en: "A match can start without a room or connected opponent; solo mode shows only your roster.",
      },
      items: [],
    },
    {
      version: "0.10.1",
      date: "2026-09-26",
      title: { ru: "Турнирный режим отключён", en: "Tournament mode disabled" },
      summary: {
        ru: "Турнирный режим убран из главного меню и настроек.",
        en: "Tournament mode was removed from the main menu and Settings.",
      },
      items: [],
    },
    {
      version: "0.10.0",
      date: "2026-09-26",
      title: { ru: "Новый игровой экран", en: "Redesigned game screen" },
      summary: {
        ru: "Матч стал компактным мобильным пультом с раундами, ресурсами, пасами, VP и быстрыми панелями моделей.",
        en: "The match is now a compact mobile console with rounds, resources, passes, VP, and quick model panels.",
      },
      items: [
        { ru: "Обычная активация и активация с Audacity отмечаются отдельно.", en: "Regular and Audacity activations are tracked separately." },
      ],
    },
    {
      version: "0.9.3",
      date: "2026-09-26",
      title: { ru: "Цифровые коды комнат", en: "Numeric room codes" },
      summary: {
        ru: "Коды новых матчевых комнат теперь состоят из шести цифр.",
        en: "New match room codes now use six digits.",
      },
      items: [],
    },
    {
      version: "0.9.2",
      date: "2026-09-26",
      title: { ru: "Надёжное обновление файлов", en: "Reliable client updates" },
      summary: {
        ru: "Версии клиентских файлов помогают браузеру сразу загружать исправления вместо старого JavaScript из кэша.",
        en: "Client asset versions make browsers load fixes instead of stale cached JavaScript.",
      },
      items: [],
    },
    {
      version: "0.9.1",
      date: "2026-09-26",
      title: { ru: "Матч без цифровой колоды", en: "Matches without a digital deck" },
      summary: {
        ru: "Исправлен вход в матч с обычным ростером без собранной цифровой колоды Objective-карт.",
        en: "Fixed match entry for standard rosters without a completed digital Objective deck.",
      },
      items: [],
    },
    {
      version: "0.9.0",
      date: "2026-09-26",
      title: { ru: "Онлайн-комнаты вместо QR", en: "Online rooms replace QR sharing" },
      summary: {
        ru: "QR-обмен ростерами заменён комнатами с коротким кодом, восстановлением сессии и готовностью обоих игроков.",
        en: "QR roster sharing was replaced with short-code rooms, session recovery, and two-player readiness.",
      },
      items: [
        { ru: "Добавлен комнатный сервис на Cloudflare Worker и D1.", en: "A Cloudflare Worker and D1 room service was added." },
        { ru: "Ростеры без цифровой колоды Objective-карт поддерживаются в матчах.", en: "Matches support rosters without a digital Objective deck." },
      ],
    },
    {
      version: "0.8.3",
      date: "2026-09-04",
      title: { ru: "Каталог скульптов Суда сов", en: "Court of Owls sculpt catalog" },
      summary: {
        ru: "Добавлен отдельный каталог из 20 Supported-скульптов Суда сов с корректным учётом профилей.",
        en: "Added a separate catalog of 20 supported Court of Owls sculpts with accurate profile mapping.",
      },
      items: [],
    },
    {
      version: "0.8.2",
      date: "2026-09-04",
      title: { ru: "Карты Vigilantes и мобильный билдер", en: "Vigilantes cards and mobile builder" },
      summary: {
        ru: "Добавлены полные переводы карт и снаряжения Vigilantes, разделы Bat Family и Teen Titans и исправления мобильного билдера.",
        en: "Added complete Vigilantes card and equipment translations, Bat Family and Teen Titans sections, and mobile builder fixes.",
      },
      items: [
        { ru: "Каталог содержит 291 доступную для печати запись модели из 682.", en: "The catalog includes 291 printable model entries out of 682." },
      ],
    },
  ]);

  const appVersion = document.querySelector('meta[name="app-version"]')?.content.trim() || "";
  const currentRelease = RELEASES.find((release) => release.version === appVersion);
  let language = "ru";
  let sessionSeenVersion = "";
  let changelogReturnToSettings = false;
  let changelogTrigger = null;

  try {
    language = localStorage.getItem("bmg_lang") === "en" ? "en" : "ru";
  } catch {
    language = "ru";
  }

  const byId = (id) => document.getElementById(id);
  const localCopy = (value) => value?.[language] || value?.ru || "";
  const escapeHtml = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  function localizedDate(date) {
    const parsed = new Date(`${date}T12:00:00`);
    return new Intl.DateTimeFormat(language === "en" ? "en-GB" : "ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(parsed);
  }

  function storedSeenVersion() {
    try {
      return localStorage.getItem(SEEN_VERSION_KEY) || sessionSeenVersion;
    } catch {
      return sessionSeenVersion;
    }
  }

  function markCurrentReleaseSeen() {
    if (!appVersion) return;
    sessionSeenVersion = appVersion;
    try {
      localStorage.setItem(SEEN_VERSION_KEY, appVersion);
    } catch {
      // Session state still prevents the notice from repeating if storage is unavailable.
    }
    hideReleaseNotice();
  }

  function renderReleaseNotice() {
    const content = byId("releaseNoticeContent");
    const historyButton = byId("releaseNoticeHistoryButton");
    const dismissButton = byId("releaseNoticeDismissButton");
    if (!content || !historyButton || !dismissButton || !currentRelease) return;

    content.innerHTML = `
      <div class="release-notice-meta">
        <span>${language === "en" ? "New version" : "Новая версия"}</span>
        <b>v${escapeHtml(currentRelease.version)}</b>
      </div>
      <h2 id="releaseNoticeTitle">${escapeHtml(localCopy(currentRelease.title))}</h2>
      <p>${escapeHtml(localCopy(currentRelease.summary))}</p>
      <ul>
        ${currentRelease.items.slice(0, 3).map((item) => `<li>${escapeHtml(localCopy(item))}</li>`).join("")}
      </ul>
    `;
    historyButton.textContent = language === "en" ? "Full changelog" : "Вся история";
    dismissButton.textContent = language === "en" ? "Got it" : "Понятно";
  }

  function showReleaseNoticeIfNeeded() {
    const modal = byId("releaseNoticeModal");
    const testEnabled = window.__BMG_TEST_RELEASE_NOTES__ === true;
    if (!modal || !currentRelease || storedSeenVersion() === appVersion || (navigator.webdriver && !testEnabled)) {
      hideReleaseNotice();
      return;
    }
    renderReleaseNotice();
    modal.classList.add("active");
    modal.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => byId("releaseNoticeDismissButton")?.focus({ preventScroll: true }));
  }

  function hideReleaseNotice() {
    const modal = byId("releaseNoticeModal");
    if (!modal) return;
    modal.classList.remove("active");
    modal.setAttribute("aria-hidden", "true");
  }

  function renderChangelog() {
    const content = byId("changelogContent");
    const kicker = byId("changelogKicker");
    const title = byId("changelogTitle");
    const closeButton = byId("changelogCloseButton");
    if (!content || !kicker || !title || !closeButton) return;

    kicker.textContent = language === "en" ? "Update archive" : "Архив обновлений";
    title.textContent = language === "en" ? "Changelog" : "История изменений";
    closeButton.setAttribute("aria-label", language === "en" ? "Close" : "Закрыть");

    content.innerHTML = RELEASES.map((release, index) => `
      <article class="changelog-entry${index === 0 ? " is-current" : ""}">
        <div class="changelog-entry-meta">
          <span class="changelog-version">v${escapeHtml(release.version)}</span>
          <time datetime="${escapeHtml(release.date)}">${escapeHtml(localizedDate(release.date))}</time>
          ${index === 0 ? `<b>${language === "en" ? "Current" : "Текущая"}</b>` : ""}
        </div>
        <h3>${escapeHtml(localCopy(release.title))}</h3>
        <p>${escapeHtml(localCopy(release.summary))}</p>
        ${release.items.length ? `<ul>${release.items.map((item) => `<li>${escapeHtml(localCopy(item))}</li>`).join("")}</ul>` : ""}
      </article>
    `).join("");
  }

  function openChangelog(options = {}) {
    const modal = byId("changelogModal");
    if (!modal) return;
    changelogTrigger = document.activeElement;
    changelogReturnToSettings = options.returnToSettings === true;
    markCurrentReleaseSeen();
    renderChangelog();
    if (changelogReturnToSettings && byId("settingsModal")?.classList.contains("active")) {
      closeSettings();
    }
    modal.classList.add("active");
    modal.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => byId("changelogCloseButton")?.focus({ preventScroll: true }));
  }

  function closeChangelog() {
    const modal = byId("changelogModal");
    if (!modal?.classList.contains("active")) return;
    modal.classList.remove("active");
    modal.setAttribute("aria-hidden", "true");
    if (changelogReturnToSettings) {
      changelogReturnToSettings = false;
      openSettings();
      byId("settingsChangelogButton")?.focus({ preventScroll: true });
      return;
    }
    changelogTrigger?.focus?.({ preventScroll: true });
    changelogTrigger = null;
  }

  function handleReleaseNoticeBackdropClick(event) {
    if (event.target?.id === "releaseNoticeModal") markCurrentReleaseSeen();
  }

  function handleChangelogBackdropClick(event) {
    if (event.target?.id === "changelogModal") closeChangelog();
  }

  function init() {
    renderChangelog();
    byId("releaseNoticeDismissButton")?.addEventListener("click", markCurrentReleaseSeen);
    byId("releaseNoticeHistoryButton")?.addEventListener("click", () => openChangelog());
    showReleaseNoticeIfNeeded();
  }

  window.addEventListener("bmg-language-change", (event) => {
    language = event.detail?.language === "en" ? "en" : "ru";
    renderReleaseNotice();
    renderChangelog();
  });

  window.addEventListener("storage", (event) => {
    if (event.key === SEEN_VERSION_KEY && event.newValue === appVersion) hideReleaseNotice();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (byId("changelogModal")?.classList.contains("active")) {
      event.preventDefault();
      closeChangelog();
      return;
    }
    if (byId("releaseNoticeModal")?.classList.contains("active")) {
      event.preventDefault();
      markCurrentReleaseSeen();
    }
  });

  window.openChangelog = openChangelog;
  window.closeChangelog = closeChangelog;
  window.dismissReleaseNotice = markCurrentReleaseSeen;
  window.handleReleaseNoticeBackdropClick = handleReleaseNoticeBackdropClick;
  window.handleChangelogBackdropClick = handleChangelogBackdropClick;
  window.BMGChangelog = Object.freeze({
    currentVersion: appVersion,
    releases: RELEASES,
    seenStorageKey: SEEN_VERSION_KEY,
    open: openChangelog,
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
