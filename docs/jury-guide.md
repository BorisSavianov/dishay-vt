# „Дишай ВТ“: jury guide for Teodor (ML)

What to read so you can explain the ML part and answer any jury question. Every number here comes from `docs/slides/numbers.md`, `ml/models/aq_meta.json`, `web/src/data/aq_episode.json`, the scoreboard replay and `ml/models/aq_sources.json` (state at 13:00, 20.11.2026). If a slide and this guide disagree, `docs/slides/numbers.md` wins: it is generated from the model reports.

**Reading order (about 40 min):**
1. The pitch.
2. The cheat sheet.
3. Sections 1–6.
4. The Q&A bank: say the BG answers out loud once.

---

## The pitch (30 s, in Bulgarian)

> Във Велико Търново зимата идва със смог, а официалните станции не дават картина на целия град час по час. Затова взехме данните от 555 гражданските сензора в България, времето и официалната европейска прогноза CAMS и обучихме модел на видеокарта, който прогнозира фините прахови частици за 72 часа напред на всеки сензор. За ВТ грешката ни е с 48% по-малка от CAMS миналата зима и с 50% по-малка този ноември. Човек с астма или родител получава предупреждение вечерта преди лош ден – в сайта, в приложението и в Телеграм.

---

## Cheat sheet

| What | Number | Where it comes from |
|---|---|---|
| Sensors in training | **555** (sensor.community, Bulgaria) | `aq_meta.json` |
| Hourly sensor readings | **5,277,731** | `aq_meta.json` |
| Training rows | **5,063,908** (sensor × issue hour × horizon) | `aq_meta.json` |
| Stations forecast live | **560**, every hour | forecast log |
| VT sensors (≤ 10 km) | **9** | episode |
| Model | **XGBoost on GPU (RTX 4070), `xgb-v2`**; 4 models: PM2.5, PM10, 10% and 90% quantiles | model card |
| Holdout | **winter 2025/26** (1 Oct – 31 Mar), never seen in training | model card |
| PM2.5 MAE at 24 h, **VT** | **model 3.2**, persistence 4.8, CAMS 6.1 → **48% better than CAMS**, 33% better than persistence | numbers.md |
| PM2.5 MAE at 24 h, **BG** | **model 2.7**, persistence 3.7, CAMS 8.5 → **68% better than CAMS** | numbers.md |
| This season, real forecast weather (1–19 Nov 2026) | VT **2.6 vs CAMS 5.2** (persistence 3.6) → **50% better**; BG 2.9 vs 7.8 → 63% | scoreboard replay |
| "Tomorrow's PM10 > 50" F1 | **model 0.49**, CAMS 0.21, persistence 0.37 | numbers.md |
| 10–90% band coverage | **78%** of real values fall inside (ideal 80%) | numbers.md |
| Day-before warnings, VT, last winter | **23 bad days (EAQI ≥ 3): we warned on 18, with 11 false alarms. CAMS warned on 20, with 23 false alarms.** Of the 10 worst days: we warned on 9, CAMS on 10 | episode score |
| Smog episode replay | **18.12.2025:** observed PM10 68.9 (over the EU limit of 50). Our forecast the day before (17.12, 12:00) was level 3, so it warned the sensitive groups | episode |
| Top drivers (feature importance) | recent pollution 47%, CAMS 14%, humidity 13%, wind 6%, calendar 5%, neighbours 4%, mixing layer 4%, temperature 3% | `aq_meta.json` |
| Sources, VT last winter (**estimate**) | heating **45%**, regional/transported 25%, other local 27%, traffic 3% | `aq_sources.json` |
| What-if: 20% of wood-heated homes switch | **15 instead of 23** bad days last winter (estimate) | `aq_sources.json` |
| Cost to run | **€0**: Vercel free, Neon free, Open-Meteo free, our own PC | |

---

## 1. The system end to end

```
sensor.community (citizen PM sensors) ─┐
Open-Meteo weather (ERA5 + forecast)  ──┤
CAMS Europe air-quality forecast      ──┼─► Teodor's PC (RTX 4070), every hour at :07
OpenStreetMap, Eurostat (context)     ──┘      ml/aq_forecast.py: predict 1–96 h for 560 stations,
                                                explain (SHAP), sources, scoreboard
                                                      │ upsert
                                                      ▼
                                               Neon Postgres (aq_forecast)
                                                      │
                     Vercel (Next.js): /api/aq ───────┼──► web (dishay-vt.vercel.app)
                                                      ├──► Expo app (iOS): profile + local alerts
                                                      └──► Telegram bot @dishay_vt_bot (/api/telegram)
```

- **Why the model runs on a PC, not on Vercel.** The Vercel free tier can't run Python or XGBoost on a GPU (function size and time limits), and its cron runs only once a day. So we use batch inference: the PC computes and Vercel only serves rows. The hosting doesn't limit the model's quality.
- **If the PC goes off:** the web falls back to the last committed forecast file (`web/src/data/aq_forecast.json`) and says so on the page.
- **A 5-minute live collector** (`ml/aq_collect.py`) fills today's hours, because the sensor.community archive publishes yesterday's data only.

## 2. The data and why these data

| Source | Role | Licence |
|---|---|---|
| sensor.community | **Target** and recent-pollution features. Citizen SDS011/PMS/SPS30 sensors | ODbL |
| Open-Meteo ERA5 archive | Weather history for training: temperature, humidity, wind, rain, pressure, **mixing-layer height** | CC BY 4.0 |
| Open-Meteo forecast | The same weather for the next 4 days, live | CC BY 4.0 |
| CAMS Europe (Copernicus), via Open-Meteo | Official PM forecast: an **input** and the **baseline to beat** | Copernicus licence |
| Open-Meteo Previous Runs | Archived *forecast* weather, for the honest November replay | CC BY 4.0 |
| OpenStreetMap | Health layer: pharmacies, hospitals | ODbL |
| Eurostat `sdg_11_50` | Bulgaria vs EU PM2.5 exposure (context) | Eurostat |

**„А защо точно тези данни?“**
- Official stations are few and don't give an hour-by-hour picture of the whole city. The citizen sensors give 9 measured points in VT alone, and 555 in Bulgaria. (Don't claim there is *no* official station in VT: say „малко са и не покриват целия град“.)
- Smog is driven by the weather (cold, no wind, inversions), so we use weather.
- CAMS is the official European forecast, so it's both an input and the bar we must clear.

**Cleaning:**
- **Hours:** an hour counts only with at least 6 readings. Values above 999 and 6-hour flatlines are dropped.
- **Broken sensors:**
  - an hour is dropped when it reads over 8× the median of the sensors within 15 km and is above 100 µg/m³;
  - a whole sensor is dropped when more than 30% of its hours are flagged that way, or when it reads under 1/8 of its neighbours most of the time they see real pollution;
  - examples: Арбанаси averaged 294 µg/m³ and was dropped; ВТ – Акация was stuck at 0.6.
- **Humidity correction:** optical sensors over-read in fog and humid air (the particles absorb water). Above 80% RH we divide by the **κ-Köhler growth factor** (Crilley et al. 2018, κ = 0.4), with RH capped at 95%. In VT the correction is above 1.5× in about a third of winter hours (valley fog).
- **Uptime:** sensors with under 60% uptime are dropped.
- **Season:** heating seasons only (Oct–Mar, 2023 → today). Winter smog is the problem; summer ozone and dust are out of scope.

## 3. The model

- **The question it answers:** given a sensor's recent readings, its neighbours, the weather forecast and the CAMS forecast, what will PM2.5 and PM10 be at that sensor each hour for the next 72 hours?
- **One model for all horizons (direct multi-horizon).** The horizon (1–72 h) is a feature. Each training row is sensor × issue hour × a random horizon, with 40% of rows at 1–6 h. This is simpler and more stable than 72 separate models, and it doesn't feed its own errors back in, as a recursive model would.
- **Target:** the *change* from the last known value, so the model starts from "now" (persistence) and learns the correction. At 1 h persistence is still marginally better (1.2 vs 1.3 µg/m³); from 3 h on the model wins clearly.
- **Algorithm:** XGBoost (gradient-boosted trees) on CUDA, with an L1 (absolute error) loss, which is robust to sensor spikes.
  - **Four models:** PM2.5 point, PM10 point, and PM2.5 10% and 90% quantiles, which give the shaded "likely range" band.
  - **Training speed:** retraining all four on 5.06M rows takes about 2 minutes on the RTX 4070.
  - **LightGBM tied** (24 h MAE 2.74 vs 2.76). XGBoost won for VT (3.21 vs 3.25), PM10 > 50 F1 and speed. Averaging the two gained nothing.
  - **Tried and rejected:** L2 and Huber losses (worse) and upwind-neighbour features (no gain).
- **Features (42),** with importance in brackets:
  - recent pollution: lags 1/2/3/6/24/48 h, 24 h mean and max, the same hour yesterday (47%);
  - CAMS at the target hour and at the issue hour, and our sensor/CAMS ratio (14%);
  - humidity at the target and the issue hour (13%);
  - wind speed and direction, 6 h mean wind (6%);
  - calendar: hour, weekday, month, heating season, BG holidays (5%);
  - nearby sensors' mean within 5 km (4%);
  - **mixing-layer (boundary-layer) height**: low means an inversion lid trapping smoke (4%);
  - temperature (3%), rain, pressure tendency, location, elevation, sensor type.
- **Missing data:** short lags are hidden in 15% of training rows, so the model copes when today's archive isn't published yet.
- **CAMS ends about 63 h out.** Past that hour, the model's CAMS input repeats CAMS's last forecast day. Without this, the forecast jumped from 2.2 to 8.3 at hour 64; fixed on 20.11. The dashed CAMS line on the chart still stops where CAMS stops.
- **„Защо“ reasons on the day cards:** SHAP values (each feature's contribution to the prediction), grouped into physical drivers. Example: „нисък слой на смесване (инверсия)“, „слаб вятър“, „студена нощ – отопление“.
- **Alerts use `alert_level`,** the level at the upper-middle of the band (about the 70th percentile), not the point forecast. The point forecast is cautious on smog days and caught only 7 of 23 bad days. Missing a smog day costs a person with asthma more than a false alarm does.

## 4. How we know it works (validation)

- **Split by time, never shuffled.**
  - Train: Oct 2023 – Mar 2025. Early stopping: 15 Feb – 31 Mar 2025.
  - **Holdout: the whole winter 2025/26, never seen,** with a 72 h gap before it.
  - A random split would leak: neighbouring hours are almost identical.
- **Baselines:**
  - **persistence** ("tomorrow = today", the honest naive forecast);
  - **CAMS** raw;
  - CAMS rescaled by the sensor/CAMS ratio.
- **Results:** see the cheat sheet. All of BG by horizon (`docs/slides/mae_by_horizon.png`), model / persistence / CAMS: 1 h 1.3 / 1.2 / 8.1; 3 h 2.0 / 2.4 / 8.6; 6 h 2.8 / 3.7 / 13.2; 24 h 2.7 / 3.7 / 8.5; 48 h 2.9 / 4.2 / 8.5; 72 h 3.0 / 4.5 / 8.6. It beats CAMS at every horizon and persistence from 3 h on. At 1 h "now" is hard to beat.
- **The live proof („Проверка на живо“, on the „Защо?“ page and slide 6):**
  - **The problem it solves:** training uses *observed* weather (ERA5), but live forecasts use *forecast* weather, which is worse. So the holdout is optimistic.
  - **What we did:** replayed **1–19 Nov 2026** (this season, never seen) with the models trained before winter 2025/26. A forecast was issued each day at 12:00 using the weather **as it was forecast at the time** (Open-Meteo Previous Runs). The weather run is never newer than the issue time: hours 13:00–23:00 of the next day use the run from 2 days earlier.
  - **The mixing-layer height isn't in the archive,** so we ran without it entirely (the strict run). It still beats CAMS: VT 2.6 vs 5.2.
  - **The honest caveat:** CAMS, both as our input and as the baseline, comes from Open-Meteo's archive, which keeps the newest run for each hour. Both columns get the same CAMS, so model vs CAMS is fair. Model vs persistence is slightly flattered.
  - **Live log:** every hourly forecast since 20.11 is logged and scored as the readings arrive.
- **The smog episode (18.12.2025):**
  - Observed in VT: PM10 68.9 µg/m³, PM2.5 30.0, over the EU daily limit.
  - Our forecast the day before (17.12, 12:00): level 3 („умерен“), which is an alert for sensitive groups, so a parent would have known the evening before.
  - **Be honest about magnitude:** we forecast PM10 36, not 69. The warning was right, the size was too low. That's why alerts use the upper part of the band.

## 5. Who it helps and how (alerts)

- **Levels:** the European Air Quality Index (EEA), from the worse of PM2.5 and PM10.

  | Level | PM2.5 (µg/m³) | PM10 (µg/m³) |
  |---|---|---|
  | 1 Добър | 0–5 | 0–15 |
  | 2 Задоволителен | 5–15 | 15–45 |
  | 3 Умерен | 15–50 | 45–120 |
  | 4 Лош | 50–90 | 120–195 |
  | 5 Много лош | 90–140 | 195–270 |
  | 6 Изключително лош | above 140 | above 270 |

  The EU daily limit for PM10 is 50.
- **Profiles:** астма, дете, възрастен and бегач are alerted from level 3. Everyone else from level 4.
- **Timing:** 19:00 the evening before a bad day, or 07:30 that morning. Each day is alerted once.
- **Channels:**
  - **web:** a profile selector with advice;
  - **iOS app:** local notifications planned from the forecast, with no server push;
  - **Telegram bot @dishay_vt_bot:**
    - `/start` → pick a profile → a 3-day forecast;
    - real alerts come from the hourly loop;
    - `/demo` sends the 18.12.2025 replay, labelled „Повторение“;
    - it stores only the chat id, profile and station.
- **Who:** about 1 in 10 children has asthma; also the elderly, runners, parents. The municipality can use the source split.
- **AI explanation** (the web „Какво означава това за мен?“ section):
  - an LLM (Groq) rewrites the forecast in plain words for the chosen group;
  - it only sees our numbers and can't add any;
  - if it fails, a text built from the figures is shown instead.

## 6. „Кой замърсява?“ (sources estimate)

- **What it is:** an **estimate**, not a measurement. Citizen sensors measure particle mass, not chemistry. We split each forecast hour into:
  - **regional (пренос):** the 20th percentile of sensors 15–80 km from VT, i.e. the background that would be there without the city;
  - **always-on local:** the excess on mild days (> 10 °C), by hour and weekday/weekend;
  - **traffic:** that excess on weekdays minus weekends (the 08:00 commute peak is about 25% lower at weekends);
  - **heating:** the rest of the excess, counted **only below 10 °C**.
- **The evidence:** VT's excess above the regional background is 4.2 µg/m³ above 10 °C and 14.5 below 0 °C. The evening peak (19–23 h) is the same on weekdays and weekends, so it isn't traffic.
- **Last winter, VT:** heating 45%, regional 25%, other local 27%, traffic 3%.
- **What-if:** if 20% of wood-heated homes switched heating, there would have been **15 instead of 23** bad days last winter. Many bad days sit just above the level-3 line, so a small cut moves them below it.
- **Biases (say them):**
  - On cold inversion nights traffic smoke is trapped too, so heating may still be over-credited, and the what-if is an upper bound.
  - „Пренос“ includes the smoke of nearby villages.
  - Traffic looks small partly because there are few weekend samples.
- **This week is mild and clean.** The live split is mostly regional (about 76%), which is why the demo uses last winter's numbers.

## 7. Limits (say them before the jury does)

1. **Citizen sensors aren't reference instruments.** The humidity correction is a published approximation, not a calibration against an official station. Next step: calibrate against the nearest official (ИАОС) stations.
2. **Heating-season model.** Summer ozone, Saharan dust and fires are out of scope.
3. **Weather in training vs live:** training uses observed weather and live uses forecast weather. The November replay measures that gap: VT 2.6 this season vs 3.2 on the holdout. It's a different period, but there's no sign of a collapse.
4. **The model under-forecasts the size of the worst days.** That's why alerts use the band, not the point forecast.
5. **The sources split is an estimate** with known biases (section 6).
6. **The live loop depends on one PC.** Next step: a GitHub Actions cron, or a small VM.

## 8. Q&A bank

Each answer is what to say, in Bulgarian. Details are in the sections above.

### Data

1. **„Защо граждански сензори, а не официалните станции?“**
   Официалните станции са малко и не показват целия град час по час. Гражданските сензори дават 9 точки само във ВТ и 555 в цяла България – това е най-гъстата мрежа, която имаме.
2. **„Не са ли неточни евтините сензори?“**
   Да, затова ги чистим: махаме счупени сензори (например Арбанаси с 294 µg/m³), замръзнали стойности и пикове, и коригираме влажността по формулата κ-Köhler – при мъгла сензорите надценяват до 1,5–2 пъти. И важното: сравняваме прогнозата си със същите сензори, така че оценката е честна спрямо това, което мерим.
3. **„Колко данни имате?“**
   5,28 милиона часови измервания от 555 сензора, три отоплителни сезона, плюс времето и CAMS за всеки час.
4. **„Защо само зимата?“**
   Смогът в България е зимен проблем – отопление и инверсии. Лятото има други причини (озон, прах) и е извън обхвата засега.
5. **„Откъде е времето?“**
   Open-Meteo: исторически данни ERA5 за обучението и прогнозата за 4 дни напред за живата прогноза.

### Model

6. **„Какъв модел използвате и защо?“**
   XGBoost – градиентно усилени дървета – на видеокарта RTX 4070. Подходящ е за таблични данни, бърз е (обучение за около 2 минути на 5 милиона реда) и обясним. Пробвахме и LightGBM – резултатите бяха равни.
7. **„Защо не невронна мрежа / LSTM?“**
   За таблични данни с 42 признака дърветата обикновено са по-точни и много по-бързи за обучение и обяснение. За хакатон предпочетохме модел, който можем да проверим честно.
8. **„Как прогнозирате 72 часа?“**
   Един модел, на който хоризонтът е признак. Той прогнозира промяната спрямо последната стойност, така че тръгва от „сега“ и учи корекцията.
9. **„Кое влияе най-много?“**
   Скорошното замърсяване – 47%, после прогнозата на CAMS – 14%, влажността – 13%, вятърът и инверсията. На всяка дневна карта показваме топ причините.
10. **„Какво е лентата около линията?“**
    Вероятният диапазон – между 10-ия и 90-ия процентил. 78% от реалните стойности попадат в него при цел 80%.
11. **„Как обяснявате прогнозата?“**
    SHAP стойности – приносът на всеки фактор, групирани в разбираеми причини като „нисък слой на смесване (инверсия)“ и „слаб вятър“.

### Validation

12. **„Как знаете, че не прегаряте модела (overfitting)?“**
    Разделяме по време, не случайно: обучение до март 2025, тест на цялата зима 2025/26, която моделът не е виждал, с 3 дни разстояние. Случайно разделяне би излъгало, защото съседните часове си приличат.
13. **„С какво се сравнявате?“**
    С два базови модела: „утре = днес“ и официалната прогноза CAMS на Copernicus. Бием и двата: за ВТ 3,2 срещу 4,8 и 6,1 µg/m³.
14. **„Обучавате с реалното време, а прогнозирате с прогнозата за времето – това не е ли измама?“**
    Точно затова направихме „Проверка на живо“: пуснахме модела за 1–19 ноември с прогнозата за времето, каквато е била тогава, и с модели, които не са виждали този сезон. Пак сме с 50% по-точни от CAMS за ВТ.
15. **„Използвате ли бъдещи данни?“**
    За времето – не: в проверката на живо ползваме само прогнози, издадени преди момента на прогнозата. CAMS идва от архива, който пази най-новата прогноза, но е еднакъв за нас и за CAMS колоната, така че сравнението е честно. Казваме го и на слайда.
16. **„Хващате ли лошите дни?“**
    Миналата зима в ВТ имаше 23 лоши дни за чувствителни групи. Предупредихме за 18 вечерта преди това, с 11 фалшиви тревоги. CAMS хвана 20, но с 23 фалшиви тревоги – два пъти повече излишни аларми.
17. **„Защо CAMS хваща повече лоши дни, ако сте по-точни?“**
    CAMS вдига тревога много по-често – хваща 20, но с 23 фалшиви, т.е. повече от половината му сигнали са излишни. Ние – 18 с 11 фалшиви. По-точни сме в средното и по-пестеливи с тревогите, а за алармите ползваме горната част на диапазона, за да не изпускаме лоши дни.
18. **„Дайте пример.“**
    18 декември 2025: PM10 68,9 във ВТ, над нормата на ЕС. Прогнозата ни от предния ден по обед беше ниво 3 – предупреждение за астма и деца. Честно: предвидихме риска, но подценихме големината – 36 вместо 69.

### Usefulness and product

19. **„Кой ще го ползва?“**
    Родители на деца с астма, възрастни, бегачи – около всяко десето дете има астма. Получават известие вечерта преди лош ден. Общината може да ползва оценката за източниците.
20. **„С какво е по-добро от съществуващите приложения?“**
    Повечето показват какво е сега. Ние казваме какво ще бъде утре, за конкретния човек, и защо – с прогноза, по-точна от официалната.
21. **„Как работи предупреждението?“**
    Избирате профил и станция. При ниво 3 за чувствителни групи (4 за останалите) получавате известие в 19:00 вечерта преди това – в приложението или в Телеграм бота.
22. **„Какво е „Кой замърсява?“?“**
    Оценка – не измерване – колко от праха е от отопление, трафик и пренос. Миналата зима около 45% от PM2.5 във ВТ е от отопление при студено време. Ако 20% от домовете на дърва сменят отоплението – 15 вместо 23 лоши дни.
23. **„Можете ли да сте сигурни за източниците без химичен анализ?“**
    Не напълно и затова го наричаме оценка. Опираме се на два ясни сигнала: прахът расте със студа и вечерният пик е еднакъв в делник и празник, значи не е трафик. Казваме и изкривяванията.

### Tech

24. **„Къде работи моделът?“**
    На компютъра ни с видеокарта – всеки час прави прогноза за 560 станции и я записва в базата Neon. Сайтът на Vercel само чете. Безплатно е и не ограничава модела.
25. **„Какво става, ако компютърът спре?“**
    Сайтът показва последната запазена прогноза и казва, че не е от последния час. Следваща стъпка: автоматично пускане в облака (GitHub Actions).
26. **„Колко струва?“**
    Нула – безплатни нива на Vercel, Neon и Open-Meteo и наш хардуер.
27. **„Какви данни пазите за потребителите?“**
    Само номер на чата, профил и станция за Телеграм. Без имена. Приложението пази профила само на телефона.
28. **„AI-ът не си ли измисля?“**
    AI-ът вижда само нашите числа и само ги преразказва за избраната група. Ако не отговори, показваме текст, сглобен от числата.

### Next steps

29. **„Какво следва?“**
    Автоматично пускане всеки час в облака, калибриране спрямо официалните станции, повече градове, лятото (озон), и училищата и общината като потребители.
30. **„Може ли за друг град?“**
    Да – моделът вече прогнозира за 560 станции в цяла България. ВТ е само избраният град на началната страница.

### Hard follow-ups to expect

- **„Защо грешката ви е по-малка този сезон, отколкото на теста?“** Ноември беше чист, а при чист въздух грешките са малки. Затова сравняваме винаги срещу CAMS в същия период – там предимството е 48–50% и в двата.
- **„MAE от 3 µg/m³ много ли е?“** За контекст: нивата за чувствителни групи започват от 15 µg/m³ PM2.5, а смогът във ВТ стига 30–70. Грешка 3 е малка спрямо прага, а CAMS греши двойно повече.
- **„За 1 час напред по-добри ли сте от „утре = днес“?“** Почти равни сме (1,3 срещу 1,2) – следващият час почти винаги прилича на сегашния. Ползата е от 3 часа нататък: при 24 часа 2,7 срещу 3,7, а при 72 часа – 3,0 срещу 4,5.
- **„F1 0,49 не е ли нисък?“** Това е за прага на ЕС (PM10 над 50), който миналата зима е минат само 6 дни във ВТ – много рядко събитие. CAMS е 0,21, т.е. ние сме над два пъти по-добри.
- **„Защо не показвате прогноза за PM10 над 50 за утре?“** Тази седмица е мека и чиста. Прогнозата е ниво 1, затова в демото показваме реален лош ден от миналата зима като повторение и казваме, че е повторение.

---

## 9. Glossary (one line each)

- **PM2.5 / PM10:** particles smaller than 2.5 / 10 µm. PM2.5 reaches deep into the lungs.
- **µg/m³:** micrograms per cubic metre of air.
- **EAQI:** the EEA European Air Quality Index, levels 1 to 6.
- **CAMS:** Copernicus Atmosphere Monitoring Service, the official European air-quality forecast.
- **ERA5:** the ECMWF reanalysis, i.e. the observed weather history on a grid.
- **Persistence:** "tomorrow = today", the naive baseline.
- **MAE:** mean absolute error, the average size of the miss in µg/m³.
- **F1:** a balance of caught events and false alarms, from 0 to 1.
- **Quantile / band:** the 10% and 90% predictions, so 80% of outcomes should fall between them.
- **Holdout:** data kept out of training to test honestly.
- **SHAP:** a method that splits a prediction into each feature's contribution.
- **Mixing layer / boundary-layer height / inversion:** the height up to which air mixes. A low lid traps smoke near the ground.
- **κ-Köhler:** the formula for how particles grow by absorbing water in humid air.
- **Gradient-boosted trees (XGBoost):** many small decision trees, each one correcting the previous ones.

## 10. Your slides (speaking only)

- **Slide 4, Решението и данните (45 s):** the diagram from section 1 and the data numbers: 555 sensors, 5.28M hours, 6 sources, model on the RTX 4070.
- **Slide 6, Резултати (45 s):**
  - the bar chart `docs/slides/mae_24h.png`: 48% better than CAMS for VT last winter, 50% this November with the real forecast weather;
  - 18 of the 23 bad days warned the evening before;
  - one line on sources: heating about 45%, and with a 20% switch 15 instead of 23 bad days (estimate).
- **Slide 7, Какво следва (20 s):** the section 8 "Какво следва?" answer.
