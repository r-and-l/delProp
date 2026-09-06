const currentScript = document.currentScript;
const isAdmin = currentScript ? Number(currentScript.dataset.isAdmin) : 0;
// Полный адрес запроса активности к БД передаётся из content-script (home/misc.js)
// через data-атрибут, чтобы реальный хост и путь эндпоинта не хранились в исходниках.
const activityEndpoint = (currentScript && currentScript.dataset.activityEndpoint) || '';

const ACTIVITY_CACHE_PREFIX = 'delprop_activity_cache_';
// Паузы между фоновыми перезапросами, пока сервер отдаёт вчерашние данные (мс)
const ACTIVITY_RETRY_DELAYS = [3000, 10000, 30000, 30000, 60000, 60000, 60000];

function getLocalDayKey() {
	const n = new Date();
	return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

// Данные активности не меняются в течение дня: если за сегодня они уже получены,
// повторный запрос при обновлении страницы не нужен — берём из кэша.
function readActivityCache(id) {
	try {
		const raw = localStorage.getItem(ACTIVITY_CACHE_PREFIX + id);
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		if (parsed && parsed.day === getLocalDayKey() && Array.isArray(parsed.rows)) {
			return parsed.rows;
		}
	} catch (e) {
		// localStorage недоступен (заблокирован браузером) — работаем без кэша
	}
	return null;
}

function writeActivityCache(id, rows) {
	try {
		localStorage.setItem(ACTIVITY_CACHE_PREFIX + id, JSON.stringify({ day: getLocalDayKey(), rows }));
	} catch (e) {
		// Нет доступа к localStorage — просто не кэшируем
	}
}

// Проверка актуальности: в данных должна быть строка за сегодня.
// Если её нет — сервер отдал вчерашние данные (бывает при первой загрузке за день).
function hasTodayRow(rows) {
	const todayStr = new Date().toLocaleDateString();
	return rows.some(r => r.data && r.data.includes(todayStr));
}

async function fetchActivityRows(id) {
	const now = new Date();
	const month = now.getMonth() + 1;
	const year = now.getFullYear();

	const addr = `${activityEndpoint}?from=01.${month}.${year}&to=01.${month+1}.${year}&user_id=${id}&dhxr${new Date().getTime()}=1`
	const response = await fetch(addr);
	const data = await response.json();
	return data.rows || [];
}

async function getActivityRows(id) {
	const cached = readActivityCache(id);
	if (cached) return { rows: cached, fromCache: true };

	try {
		const rows = await fetchActivityRows(id);
		// Вчерашние данные в кэш не пишем — иначе застрянем с ними на весь день
		if (hasTodayRow(rows)) writeActivityCache(id, rows);
		return { rows, fromCache: false };
	} catch (e) {
		console.error("delProp: error getting activity from server:", e);
		return { rows: [], fromCache: false };
	}
}

function applyActivity(div, rows) {
	div.dataset.input = getTodayLogin(rows)
	div.dataset.activity = JSON.stringify(rows)
	div.dataset.user = JSON.stringify(USER_DATA)
}

// Дозапрос активности в фоне, пока сервер отдаёт вчерашние данные.
// Когда приходят сегодняшние: пишем в кэш, перевставляем div (content-script
// обработает свежие данные) и один раз за день перезагружаем страницу,
// чтобы таймеры и баланс пересчитались от свежего времени входа.
function refreshStaleActivity(id, div) {
	let attempt = 0;
	const tryOnce = async () => {
		if (attempt >= ACTIVITY_RETRY_DELAYS.length) return;
		const delay = ACTIVITY_RETRY_DELAYS[attempt++];
		setTimeout(async () => {
			try {
				const rows = await fetchActivityRows(id);
				if (!hasTodayRow(rows)) { tryOnce(); return; }

				writeActivityCache(id, rows);
				applyActivity(div, rows);
				div.remove();
				document.body.append(div);

				try {
					const flag = sessionStorage.getItem('delprop_activity_reloaded');
					if (flag !== getLocalDayKey()) {
						sessionStorage.setItem('delprop_activity_reloaded', getLocalDayKey());
						window.location.reload();
					}
				} catch (e) {
					// sessionStorage недоступен — ограничимся обновлением div
				}
			} catch (e) {
				console.error("delProp: error refreshing activity:", e);
				tryOnce();
			}
		}, delay);
	};
	tryOnce();
}

const setUserDiv = async ()=>{
	if(typeof USER_DATA !== 'undefined' && !!USER_DATA.fio){
		USER_DATA.is_manager = isAdmin;
		const div = document.createElement("div")
		div.id = 'user'
		div.textContent = USER_DATA.fio
		div.hidden = true

		const { rows, fromCache } = await getActivityRows(USER_DATA.user_id)
		applyActivity(div, rows)
		document.body.append(div)

		if (!fromCache && !hasTodayRow(rows)) {
			refreshStaleActivity(USER_DATA.user_id, div)
		}
	} else {
		setTimeout(setUserDiv,100)
	}
}

//sdfsdf

function getTodayLogin(rows) {
	const todayStr = new Date().toLocaleDateString();
	const row = rows.find(r => r.data && r.data.includes(todayStr));
	return row ? row.data.at(2) : '';
}

setUserDiv()
