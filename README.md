# BMG Crew Builder

**Batman: Gotham Chronicles Crew Builder** — это интерактивный веб-инструмент для создания и управления отрядами в настольной игре Batman Miniature Game от Knight Models.

**Batman: Gotham Chronicles Crew Builder** is an interactive web tool for creating and managing crews in the Batman Miniature Game tabletop game by Knight Models.

---

## 📋 Описание / Description

Этот проект помогает игрокам быстро собирать отряды, проверяя все правила найма моделей, лимиты рангов, аффилиации и специальные требования фракций.

This project helps players quickly build crews by checking all model hiring rules, rank limits, affiliations, and special faction requirements.

---

## 🚀 Особенности / Features

### 🇷🇺 Русский
- **Двуязычный интерфейс** — переключение между русским и английским языком
- **Просмотр карточек** — каталог всех моделей с фильтрацией по фракциям
- **Конструктор отрядов** — создание банды с автоматической проверкой правил
- **Справочник (Compendium)** — поиск по трейтам, оружию и правилам
- **PDF документы** — быстрый доступ к Rulebook, FAQ и Batmatch
- **Адаптивный дизайн** — оптимизирован для мобильных устройств
- **Сохранение настроек** — выбранный язык сохраняется между сессиями

### 🇬🇧 English
- **Bilingual interface** — switch between Russian and English
- **Cards viewer** — catalog of all models with faction filtering
- **Crew builder** — create gangs with automatic rules checking
- **Compendium** — search traits, weapons, and rules
- **PDF documents** — quick access to Rulebook, FAQ, and Batmatch
- **Responsive design** — optimized for mobile devices
- **Settings persistence** — selected language saved between sessions

---

## 🎮 Функционал конструктора / Builder Features

### 🇷🇺 Русский
- **Автоматическая проверка правил:**
  - Лимиты Reputation и Funding
  - Ограничения по рангам (Leader, Sidekick, Henchman, Free Agent, Vehicle)
  - Требования аффилиации между моделями
  - Уникальность имён (realname)
  - Специальные правила фракций (Bat Family, Cults, Batman Who Laughs)

- **Учёт трейтов:**
  - Elite, Veteran, Minion лимиты
  - Hates, Aversion, Required проверки
  - Treacherous предупреждения
  - Incorruptible, Possessed и другие специальные трейты

- **Снаряжение (Equipment):**
  - Добавление оборудования к моделям
  - Учёт стоимости в Rep и Funding
  - Проверка условий доступности

### 🇬🇧 English
- **Automatic rules checking:**
  - Reputation and Funding limits
  - Rank restrictions (Leader, Sidekick, Henchman, Free Agent, Vehicle)
  - Affiliation requirements between models
  - Name uniqueness (realname)
  - Special faction rules (Bat Family, Cults, Batman Who Laughs)

- **Trait tracking:**
  - Elite, Veteran, Minion limits
  - Hates, Aversion, Required checks
  - Treacherous warnings
  - Incorruptible, Possessed and other special traits

- **Equipment:**
  - Add equipment to models
  - Track Rep and Funding costs
  - Check availability conditions

---

## 📁 Структура проекта / Project Structure

```
btb-main/
├── index.html          # Основная HTML-разметка / Main HTML markup
├── style.css           # Стили и адаптивный дизайн / Styles and responsive design
├── script.js           # Логика приложения / Application logic
├── data.js             # Данные моделей, снаряжения и правила фракций
├── data_old.js         # Старая версия данных / Old data version
├── data trait.js       # Данные трейтов / Trait data
├── img/                # Изображения моделей и иконки / Model images and icons
│   ├── ico/            # Иконки интерфейса / UI icons
│   └── menu/           # Изображения меню / Menu images
└── README.md           # Этот файл / This file
```

---

## 🛠 Технологии / Technologies

- **HTML5** — семантическая разметка
- **CSS3** — стили, анимации, медиа-запросы
- **JavaScript (ES6+)** — логика приложения без фреймворков
- **Google Fonts** — шрифт Oswald
- **LocalStorage** — сохранение настроек языка

---

## 🎯 Фракции / Factions

### 🇷🇺 Русский
Проект поддерживает 20 фракций:
- Bat Family, GCPD, Birds of Prey
- Joker, Bane, League of Shadows
- Royal Flush, Penguin, Mr. Freeze
- Scarecrow, Two-Face, The Riddler
- Organized Crime, Suicide Squad
- Court of Owls, Watchmen
- Batman Who Laughs, Cults, Doom Patrol
- Unknown

### 🇬🇧 English
The project supports 20 factions:
- Bat Family, GCPD, Birds of Prey
- Joker, Bane, League of Shadows
- Royal Flush, Penguin, Mr. Freeze
- Scarecrow, Two-Face, The Riddler
- Organized Crime, Suicide Squad
- Court of Owls, Watchmen
- Batman Who Laughs, Cults, Doom Patrol
- Unknown

---

## 📱 Мобильная оптимизация / Mobile Optimization

### 🇷🇺 Русский
- Адаптивный интерфейс для экранов от 320px
- Сенсорное управление (touch-friendly)
- Оптимизированные шрифты и кнопки
- Сворачиваемые секции и вкладки

### 🇬🇧 English
- Responsive interface for screens from 320px
- Touch-friendly controls
- Optimized fonts and buttons
- Collapsible sections and tabs

---

## 🔧 Установка и запуск / Installation & Running

### 🇷🇺 Русский
Проект не требует сборки или установки зависимостей. Просто откройте `index.html` в браузере.

```bash
# Или используйте локальный сервер
python -m http.server 8000
# Откройте http://localhost:8000
```

### 🇬🇧 English
The project requires no build or dependency installation. Simply open `index.html` in a browser.

```bash
# Or use a local server
python -m http.server 8000
# Open http://localhost:8000
```

---

## 📄 Официальные документы / Official Documents

- **Rulebook:** https://app.knightmodels.com/files//rule-document-rulebook-1701448204.pdf
- **FAQs:** https://app.knightmodels.com/files//rule-document-faqs-1701683889.pdf
- **Batmatch:** https://app.knightmodels.com/files//rule-document-batmatch-1700369985.pdf

---

## ⚠️ Отказ от ответственности / Disclaimer

### 🇷🇺 Русский
Этот проект является фанатским инструментом и не аффилирован с Knight Models или DC Comics. Все изображения и названия являются собственностью соответствующих владельцев.

### 🇬🇧 English
This project is a fan-made tool and is not affiliated with Knight Models or DC Comics. All images and names are property of their respective owners.

---

## 📬 Контакты / Contact

Проект создан для сообщества игроков Batman Miniature Game.

Created for the Batman Miniature Game player community.

---

## 📝 Версия / Version

**v0.8.3** — 2026-09-04: добавлен отдельный каталог из 20 Supported-скульптов Суда сов; четыре скульпта без самостоятельных игровых профилей учитываются отдельно и не подменяют High Court Member или Nightwing.

**v0.8.3** — 2026-09-04: added a separate catalog of 20 supported Court of Owls sculpts; four sculpts without standalone game profiles are tracked separately instead of being mapped to High Court Member or Nightwing.

**v0.8.2** — 2026-09-04: полные переводы карт и снаряжения Vigilantes, отдельные разделы карт «Семья Бэтмена» и «Юные Титаны», исправленная мобильная панель билдера, 291 доступная для печати запись модели из 682 (+14).

**v0.8.2** — 2026-09-04: complete Vigilantes card and equipment translations, separate Bat Family and Teen Titans card sections, corrected mobile builder header, 291 printable model records out of 682 (+14).
