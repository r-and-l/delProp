const currentScript = document.currentScript;
const isAdmin = currentScript ? Number(currentScript.dataset.isAdmin) : 0;
// Полный адрес запроса активности к БД передаётся из content-script (home/misc.js)
// через data-атрибут, чтобы реальный хост и путь эндпоинта не хранились в исходниках.
const activityEndpoint = (currentScript && currentScript.dataset.activityEndpoint) || '';

const setUserDiv = async ()=>{
	if(typeof USER_DATA !== 'undefined' && !!USER_DATA.fio){
		USER_DATA.is_manager = isAdmin;
		const div = document.createElement("div")
		div.id = 'user'
		div.textContent = USER_DATA.fio
		div.hidden = true
		
		const activityRows = await getActivityRows(USER_DATA.user_id)
		div.dataset.input = getTodayLogin(activityRows)
		div.dataset.activity = JSON.stringify(activityRows)
		div.dataset.user = JSON.stringify(USER_DATA)
		document.body.append(div)	
	} else {
		setTimeout(setUserDiv,100)
	}
}

async function getActivityRows(id) {
	const now = new Date();
	const month = now.getMonth() + 1;
	const year = now.getFullYear();

	try {
		const addr = `${activityEndpoint}?from=01.${month}.${year}&to=01.${month+1}.${year}&user_id=${id}&dhxr${new Date().getTime()}=1`
		const response = await fetch(addr);
		const data = await response.json();
		return data.rows || [];
	} catch (e) {
		console.error("delProp: error getting activity from server:", e);
		return [];
	}
}

function getTodayLogin(rows) {
	const todayStr = new Date().toLocaleDateString();
	const row = rows.find(r => r.data && r.data.includes(todayStr));
	return row ? row.data.at(2) : '';
}

setUserDiv()
13
