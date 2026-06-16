# BMG Omsk Crew - рабочая документация проекта

Этот документ нужен как карта проекта для быстрых правок. Перед изменениями в билдере, турнире, режиме игры, картах, экипировке или синхронизации данных сначала прочитай этот файл. Цель - не изучать заново весь `script.js` и не начинать рефакторинг там, где достаточно точечной правки.

## Коротко о проекте

`BMG_omsk_crew` - локальное single-page приложение без сборщика и без runtime-зависимостей. Открывается через `index.html` в браузере. Основная логика живет в одном большом файле `script.js`, данные - в `data.js`, визуальная часть - в `style.css`.

Важное правило проекта: приложение не ходит в официальный API Knight Models во время работы. Официальные данные заранее копируются/синхронизируются в локальные справочники.

## Основные файлы

- `index.html` - статическая разметка экранов и подключение скриптов.
- `style.css` - все стили приложения, включая адаптив, билдер, матч, турнир, карточки и модалки.
- `script.js` - вся логика интерфейса, правил, импорта/экспорта, матча и турнира.
- `data.js` - локальная база моделей, карт, экипировки, правил фракций, текстов правил и переводов.
- `official-data.js` - сохраненный официальный источник/снимок данных для сверки.
- `all_json.txt` - вручную скопированный JSON-ответ официального приложения, используется как сырье для сверки.
- `official-card-translations.js` - переводы официальных Objective-карт.
- `printable-models.js` - признаки наличия локального принта.
- `img/` - изображения моделей, карт, иконок, UI-иконок.
- `reports/` - отчеты, внешние выгрузки и временная аналитика по сверкам.
- `tools/` - локальные вспомогательные скрипты.
- `admin.html`, `admin.js`, `admin.css` - отдельный админ-инструмент, не основной пользовательский UI.

## Общая архитектура

Приложение работает как SPA на глобальном состоянии и ручном рендеринге HTML-строк. Фреймворка нет.

Главные глобальные состояния в `script.js`:

- `crew` - текущая банда в билдере. Сюда попадают модели и служебные attachment-модели.
- `crewCards` - Objective-карты текущей банды.
- `crewEquipmentCounts` - счетчики экипировки для crew-wide лимитов.
- `currentFaction` - текущая выбранная фракция.
- `BMG_BOSS` - текущий босс банды.
- `BMG_AFFILIATIONS` - аффилиации босса/банды для проверок найма.
- `builderTournamentMode` - собирается ли ростер как турнирный.
- `myCrews` - сохраненные ростеры из LocalStorage.
- `batmatchState` - выбранные турнирные листы и выбранные Encounter/Event карты.
- `matchOpponentRoster`, `matchGameState` - состояние режима матча/игры.
- `currentMode` - активный экран: `menu`, `cards`, `builder`, `my-crews`, `batmatch`, `match`, `match-game`, `rules`.

Переходы между экранами идут через `showScreen(...)` и отдельные функции `showBuilder`, `showCards`, `showMyCrews`, `showBatmatch`, `showMatch`, `showRules`.

## Где какая логика находится

### Билдер банд

Главные функции:

- `showBuilder(options)` - открыть экран билдера.
- `addToCrew(model)` - центральная точка добавления/удаления модели из UI.
- `showRankSelectionModal(model, ranks)` - выбор ранга, если у модели несколько вариантов.
- `canUseRankForCurrentCrew(model, rank)` - проверка доступности модели/ранга для фильтров и кнопок.
- `bmgCanAddModel(model, options)` - фактическая проверка перед добавлением модели.
- `updateCrewBar()` - пересчет верхнего статуса билдера.
- `renderModels`, `renderUnifiedSearch`, `renderModelsSearch` - списки моделей.
- `showFullCard(model)` - полноэкранная карточка модели.

Правило: если меняется правило найма, почти всегда надо проверить оба места:

1. `canUseRankForCurrentCrew` - чтобы модель правильно появлялась/исчезала в списке.
2. `bmgCanAddModel` - чтобы прямое добавление, поиск и импорт не обходили правило.

### Стоимость REP/Funding

Не считай стоимость напрямую через `model.rep` и `model.funding`, если речь идет о билдере или экспортируемом ростере.

Используй:

- `modelRepValue(model)`
- `modelFundingValue(model, crewModels)`
- `crewModelRepTotal(model)`
- `crewModelFundingTotal(model, crewModels)`
- `crewRepUsed()`
- `crewFundingUsed(crewModels)`
- `crewFundingUsedWithCandidate(model)`

Причина: часть правил меняет эффективную стоимость. Например, `Lieutenant (X)` делает Funding модели равным 0, если в банде есть модель с нужным Alias.

Сырые `model.rep` и `model.funding` допустимы в справочнике или когда нужно показать печатную стоимость модели, но не для проверки лимитов банды.

### Уникальность моделей

Основные хелперы:

- `getDuplicateCrewIdentityModel(model, factionRules, crewModels)`
- `getCrewModelAliasIdentity(model)`
- `canRepeatCrewModelByTrait(model)`

Обычные банды проверяют уникальность по `realname`.

Для `Batman Who Laughs` есть правило `allowSameNameDifferentAlias`: разрешаются разные alias одной личности, но не одинаковый alias + realname. Повторяемые модели с `Minion (...)` и `Horde` обходят unique-проверку и ограничиваются своими лимитами.

### Специальные правила фракций

Начальная конфигурация лежит в `data.js`:

- `window.factionCrewRules`

Сейчас важные ключи:

- `ignoreStandardRankRequirements`
- `allowSameNameDifferentAlias`
- `mustHaveLeaderAsBoss`
- `onlyAffiliationMembers`
- `onlyBossAffiliationOrNoAffiliation`
- `onlyBossAffiliationObjectives`

Если добавляется новое правило фракции, сначала проверь, нельзя ли выразить его через существующий ключ. Новый ключ добавляй только если правило реально новое.

### Trait-правила найма и лимитов

Важные зоны:

- `canPassTraitRecruitmentRules(model)` - Hates, Aversion, Required, Incorruptible, Freed, Possessed и похожие проверки.
- `getMinionTraitValue`, `getMinionLimit`, `isMinionLimitReached` - Minion.
- `bmgExtraSlots`, `bmgRankCount`, `bmgEffectiveRankCount` - лимиты рангов и дополнительные слоты.
- `getDuoPartnerNames`, `modelsFormDuoPairForRank` - Duo.
- `applyPossessedRecruitmentEffects` - изменения модели при Possessed-рекрутинге.

Не добавляй ad hoc проверку рядом с UI, если ее смысл относится к правилам найма. Она должна жить в `canUseRankForCurrentCrew` и `bmgCanAddModel`.

### Экипировка

Основные зоны:

- `openEquipmentMenu(model, cardElement, sourceEvent)` - UI выбора экипировки.
- `equipmentFundingValue(eq)`, `equipmentRepValue(eq)` - стоимость.
- `canAttachEquipmentToCrewModel(...)` и соседние helpers - условия доступности.
- `getEquipmentGrantedTraits(...)` - извлечение трейтов, которые дает экипировка.
- `getDisplayTraitsWithEquipment(...)` и `renderTraits(...)` - отображение трейтов модели вместе с экипировкой.

Правило UI: если экипировка добавляет трейт через текст вида `Model gains the X rule`, трейт должен появиться в карточке модели и подсветиться как добавленный экипировкой.

Локальные предметы пока не удаляются. Если их надо скрыть, ставь недоступность/флаг, не вычищай данные.

### Objective-карты

Главные функции:

- `getObjectiveDeckStats(cards, options)` - расчет легальности колоды.
- `getObjectiveDeckWarnings(stats)` - предупреждения.
- `renderObjectiveDeckSummary()` - блок статуса колоды.
- `renderBuilderCards()` - экран карт в билдере.
- `renderBuilderCardItem(...)` - карточка Objective в билдере.
- `showBuilderCardPreview(...)` - предпросмотр карты.
- `showBuilderCardTranslation(...)` - перевод текста карты.

Размер обычной колоды задается:

- `OBJECTIVE_DECK_SIZE = 30`
- `OBJECTIVE_DECK_MAX_GENERAL = 15`
- `OBJECTIVE_DECK_MAX_SINGLE = 15`

Турнирная колода:

- `BATMATCH_DECK_SIZE = 20`
- `BATMATCH_MAX_GENERAL = 10`
- `BATMATCH_MAX_SINGLE = 10`

### Сохраненные банды

Основные функции:

- `loadMyCrewsFromStorage()`
- `saveMyCrewsToStorage()`
- `createMyCrewRecordFromText(text, options)`
- `saveBuilderCrew()`
- `renderMyCrews()`
- `importMyCrewFromTxt()`
- `buildAllMyCrewsExportText()`

LocalStorage ключ:

- `MY_CREWS_STORAGE_KEY = 'bmg_my_crews_v1'`

Формат ростера текстовый. Важные функции импорта/экспорта:

- `buildRosterExportText(rosterName)`
- `parseRosterImportText(text)`
- `importRosterFromText(text, options)`

Если меняется формат экспорта, обязательно проверь импорт старых файлов. Не ломай уже сохраненные `bmg_my_crews.txt`.

### Турнир / BatMatch

Основные функции:

- `getBatmatchDeckOptions()`
- `getBatmatchCrewEntries()`
- `getBatmatchCrewOptions(selectedId)`
- `validateBatmatchCrewEntry(crewEntry)`
- `getBatmatchRosterCheckItems(validation)`
- `validateBatmatchSetupForList(listKey)`
- `validateBatmatchPacket()`
- `renderBatmatch()`
- `renderBatmatchListPanel(listKey)`
- `buildBatmatchPacketExportText()`
- `downloadBatmatchPacket()`

LocalStorage ключ:

- `BATMATCH_STORAGE_KEY = 'bmg_batmatch_packet_v1'`

Турнир сейчас умеет выбирать как турнирные, так и обычные сохраненные банды. Обычные подсвечиваются бейджем `ОБЫЧНАЯ`, а чек-лист показывает, что не проходит.

Текущие проверки турнира:

- оба листа выбраны;
- оба листа из одной фракции;
- REP не выше 350;
- Funding не выше 1500;
- Objective deck = 20;
- General/crew-specific/single/copy-set/requirements проверяются через общий deck validator;
- не больше 1 типа character Objective card;
- `Legend` запрещен;
- Encounter/Event: ровно 3 карты каждого типа на каждый лист.

Проверка `Eternal` в турнире отключена по пользовательскому решению. Не возвращай ее без отдельной просьбы.

### Матч и режим игры

Основные функции:

- `buildMatchCrewState(crewEntry, options)`
- `buildMatchRosterFromParsedCrew(crewEntry, parsed)`
- `validateMatchRoster(parsed, options)`
- `buildMatchPayloadCode(roster)`
- `parseMatchPayloadCode(rawCode)`
- `renderMatchSection()`
- `renderMatchCrewStatus()`
- `showMatchQr()`
- `importMatchPayloadCode(code)`
- `renderMatchOpponentRoster()`

Режим игры:

- `getMatchGameRoster()`
- `buildMatchGameDisplayModel(modelEntry, roster)`
- `renderMatchGame()`
- `renderMatchGameModelCard(modelEntry, rosterIndex)`
- `renderMatchGameCards(roster)`
- `buildMatchObjectiveDeck(roster, side)`
- `renderMatchObjectivePlayArea(roster)`
- `showMatchObjectiveCard(instanceId)`
- `renderMatchSetupPanel()`
- `renderMatchSetupSelect(kind)`
- `renderMatchSetupCardsGallery(...)`

Логика Objective hand:

- у игрока рука до 4 карт;
- карты тянутся сверху;
- сброс/ресурс кладет карту под низ;
- выполненная цель идет в выполненные;
- заявленная цель лежит отдельно, затем либо выполнена, либо уходит под низ;
- кнопка shuffle перемешивает карты вне рук.

### Правила и справочник

Основные функции:

- `showRules(options)`
- `renderRulesSearch(query)`
- `renderCompendiumSearchResults(query)`
- `renderCompendiumModelsSearch(query)`
- `showTraitDesc(traitName)`
- `showTraitPopup(name, desc)`

PDF правил открываются из раздела правил. Поиск по правилам использует локально извлеченные/вшитые данные, не внешний API.

## Данные и синхронизация с официальным источником

Источник истины для моделей, карт и экипировки - официальный ответ Knight Models, но runtime приложения не должен дергать официальный endpoint. Причина: endpoint работает через VPN и не должен быть частью пользовательского приложения.

Текущий процесс:

1. Получить/скопировать официальный JSON вручную в `all_json.txt` или другой локальный источник.
2. Сравнить с `data.js` / `official-data.js`.
3. Внести расхождения в локальные справочники.
4. Для моделей без локального принта скачать/добавить изображения в `img/`.
5. Не удалять локальные сущности без необходимости: чаще скрывать или помечать недоступными.

В `data.js` могут одновременно жить:

- старые локальные записи;
- официальные записи;
- `officialOnly`;
- скрытые/отключенные локальные записи;
- ручные исправления.

Поэтому при синхронизации не делай массовую замену всего файла. Лучше точечно патчить конкретные записи или запускать уже существующие инструменты из `tools/`, если задача именно массовая.

## Частые ловушки

- `script.js` большой, но не надо дробить его на модули в рамках обычной правки. Это создаст риск сломать порядок глобальных зависимостей.
- Не считать Funding напрямую через `model.funding` в билдере. Использовать `modelFundingValue`.
- Не добавлять проверку только в UI. Для правил найма нужна пара `canUseRankForCurrentCrew` + `bmgCanAddModel`.
- Не удалять локальные модели/экипировку без явной просьбы. Скрывать или отключать.
- Не возвращать проверку Eternal в турнире без явной просьбы.
- Не дергать официальный endpoint из приложения.
- При изменении формата ростера проверять импорт сохраненных файлов.
- Если модель отображается в режиме матча, это часто уже не raw model из `data.js`, а display model из `buildMatchGameDisplayModel`.
- Attachment-модели, например формы Beast Boy, не должны считаться обычными recruited-моделями. Для этого есть `isRosterAttachment` и `getRecruitedCrewModels()`.

## Как вносить типовые изменения

### Новое правило найма модели

1. Найти модель/трейт в `data.js`.
2. Добавить/изменить helper рядом с похожими правилами.
3. Подключить в `canUseRankForCurrentCrew`.
4. Подключить в `bmgCanAddModel`.
5. Проверить список моделей, добавление из поиска, импорт ростера.

### Новая скидка или изменение стоимости

1. Не менять только `model.funding`, если цена условная.
2. Добавить правило в `modelFundingValue` или рядом с ним.
3. Проверить `crewFundingUsed`, `canAffordModelInCurrentCrew`, `bmgCanAddModel`.
4. Проверить экспорт `buildRosterExportText`.
5. Проверить UI-бейджи в билдере и full card.

### Новая экипировка

1. Добавить запись в справочник экипировки в `data.js`.
2. Указать `fundingCost`, `repCost`, `maxPerCrew`, `conditions`, `targetModels`, `effects`.
3. Если эффект дает трейт, формулировка должна быть распознаваемой: `Model gains the X rule/trait`.
4. Проверить меню экипировки и подсветку трейта.

### Изменение турнирного правила

1. Сначала открыть `validateBatmatchCrewEntry`.
2. Если это визуальная диагностика, добавить пункт в `getBatmatchRosterCheckItems`.
3. Если это правило всего пакета, менять `validateBatmatchPacket`.
4. Если меняется экспорт пакета, менять `buildBatmatchPacketExportText`.

### Изменение режима игры с Objective-картами

1. Смотреть функции `buildMatchObjectiveDeck`, `getMatchObjectiveState`, `renderMatchObjectivePlayArea`.
2. Не смешивать зоны карты: deck, hand, resource use, scored, declared.
3. После действия проверить, куда физически уходит карта: под низ, в выполненные, в заявленные, в руку.

## Быстрые проверки

Минимальная проверка после любой правки JS:

```powershell
& 'C:\Users\user\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --check script.js
```

Полезные ручные проверки в браузере:

- открыть `index.html`;
- переключить язык RU/EN;
- открыть билдер;
- выбрать фракцию;
- добавить лидера;
- проверить поиск, фильтры `Доступные`, `В банде`, `Лидеры`, `Henchmen`, `Print`;
- добавить/снять экипировку;
- сохранить ростер;
- открыть `Мои банды`;
- открыть `Турнир`;
- выбрать обычную и турнирную банду;
- открыть `Матч`;
- открыть режим игры и проверить Objective hand.

## Текущие проектные решения

- Приложение остается static SPA.
- Без сборщика и без npm-зависимостей в runtime.
- Официальный endpoint не используется приложением.
- Официальные данные считаются приоритетнее локальных при синхронизации.
- Локальные записи не удаляются автоматически, сначала скрываются/отключаются.
- Турнирный раздел называется `Турнир`, внутренние имена `batmatch_*` могут оставаться в коде.
- `Пробная партия` относится к разделу матча.
- Версия приложения уже поднималась до `0.8`; если есть UI-версия, обновлять ее отдельно при релизных изменениях.

## Мини-глоссарий

- Model - запись модели из `data.js`.
- Crew model - экземпляр модели в `crew`, может иметь `rankUsed`, `equipment`, `uniqueId`, rule-added fields.
- Recruited model - реальная модель ростера, без служебных attachment-форм.
- Attachment - служебная модель, например форма Beast Boy.
- Objective card - карта цели.
- Character Objective card - Objective-карта, привязанная к конкретному персонажу.
- Setup card - Encounter/Event карта для деплоя и событий.
- Match payload - компактный код/QR для передачи ростера в режим матча.
- BatMatch/Tournament - турнирный пакет из двух листов, 20 Objective cards, 3 Encounter и 3 Event на лист.

