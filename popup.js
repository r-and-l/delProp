const form = document.forms.my
const queryOptions = {active: true, url: self.DELPROP_HOSTS.popupActiveTabUrl}

// Ссылка автора берётся из конфига хостов, чтобы не хардкодить адрес в разметке
const authorLink = document.getElementById('authorLink')
if (authorLink && self.DELPROP_HOSTS.authorUrl) authorLink.href = self.DELPROP_HOSTS.authorUrl

const dellNewsField = form.elements.dellNews,
	changeField = form.elements.change,
	styleField = form.elements.style,
	workTimerField = form.elements.workTimer,
	mainUserField = form.elements.mainUser,
	archiveField = form.elements.archive,
	toHide = ['btns', 'styled', 'colorized', 'enabled', 'news', 'showImages']

// Shared time helpers (mirrors utils/time.js for popup context)
function parseTimeToMinutes(timeStr) {
	if (!timeStr || typeof timeStr !== 'string') return null;
	const parts = timeStr.split(':').map(Number);
	if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return null;
	return parts[0] * 60 + parts[1];
}

function minutesToTimeStr(totalMin) {
	if (totalMin === null || totalMin === undefined || isNaN(totalMin)) return '';
	const clamped = Math.min(Math.max(totalMin, 0), 23 * 60 + 59);
	const h = Math.floor(clamped / 60);
	const m = clamped % 60;
	return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function formatMinutes(totalMin) {
	if (totalMin === null || totalMin === undefined || isNaN(totalMin)) return '0ч 0м';
	const isNeg = totalMin < 0;
	const absMin = Math.abs(totalMin);
	const h = Math.floor(absMin / 60);
	const m = absMin % 60;
	return `${isNeg ? '-' : ''}${h}ч ${m}м`;
}

// Source of truth for default settings - keep in sync with utils/settings.js
function getDefaultSettings() {
	return {
		changeField: {
			btns: 'false',
			btns_style: 'normal',
			btnName: []
		},
		dellNewsField: {
			news: 'false',
			newsList: [],
			showImages: 'false',
			imageFilter: 'anime',
			customImageUrls: ''
		},
		styleField: {
			styled: 'false',
			filter: 'none',
			rndImg: 'off',
			semen: 'off',
			snow: 'off',
			colorized: 'false',
			colorTheme: {
				mainColor: '#b5deff',
				mainColorHover: '#e2efff'
			}
		},
		workTimerField: {
			timer: 'false',
			headerEnabled: 'false',
			overtimeToComp: 'false',
			userIcon: '👤',
			timerTheme: 'beer',
			startDay: '07:00',
			endDay: '16:00',
			endDayF: '14:45'
		},
		mainUserField: {
			isAdmin: 'false'
		},
		archiveField: {
			enabled: 'true',
			saveTabs: 'true',
			syncDocName: 'true',
			projectFilter: 'true',
			treeCacheEnabled: 'true'
		}
	};
}

chrome.storage.local.get(['user', 'user_input', 'formFields'], ({user, user_input, formFields})=>{
	const name = user?.fio.split(' ')[1] || 'Незнакомец'
	if (!user) mainUserField.elements.isAdmin.disabled = true

	const userNameEl = document.querySelector('.user-name')
	if (userNameEl) {
		userNameEl.textContent = name;

		if (user_input && formFields?.workTimerField) {
			const startDay = formFields.workTimerField.startDay || '07:00';
			const startMin = parseTimeToMinutes(startDay);
			const loginMin = parseTimeToMinutes(user_input);
			if (startMin !== null && loginMin !== null && loginMin > startMin) {
				const latenessMin = loginMin - startMin;
				const span = document.createElement('span');
				span.style.color = '#ff4a4a';
				span.style.fontWeight = 'bold';
				span.style.marginLeft = '6px';
				span.style.fontSize = '12px';
				span.textContent = `(+${formatMinutes(latenessMin)})`;
				userNameEl.appendChild(span);
			}
		}
	}
})





//-----------------------------------------------------------------------------------

chrome.storage.local.get('oldLinks', ({oldLinks = []})=>{
	oldLinks.forEach(link=>{
		const l = document.createElement('label');
		l.textContent = " " + link.name;
		
		const input = document.createElement('input');
		input.type = "checkbox";
		input.value = link.id;
		input.name = 'btnName';

		l.prepend(input);

		oldBtns.append(l)
	})
})

function getFormElementsArray(name) {
	const elements = form.elements[name]
	if (!elements) return []
	if (elements instanceof Element) return [elements]
	if (typeof elements.length === 'number' && !(elements instanceof Element)) {
		return Array.from(elements)
	}
	return [elements]
}

function check() {
	let checked = []
	const newsList = getFormElementsArray('newsList')
	for (const el of newsList) {
		if (el.checked){
			checked.push(el)
		}
	}

	if (form.all) {
		form.all.checked = (newsList.length > 0 && checked.length === newsList.length)
	}
}



//services

function colorLuminance(hex, lum){
	hex = String(hex).replace(/[^0-9a-f]/gi, '')

	if (hex.length < 6) {hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2]}

	lum = lum || 0

	let rgb = '#'

	for (let i = 0; i < 3; i++) {
		let c = parseInt(hex.substr(i*2,2), 16)
		c = Math.round(Math.min(Math.max(0, c + (c*lum)), 255)).toString(16)
		rgb += ("00"+c).substr(c.length)
	}

	return rgb
}

function setEndDayF(endDay){

	const o = 75*60*1000

	const t = endDay.split(':')

	const end = new Date().setHours(...t)

	const endF = new Date(end - o)


	function addZero(i) {
		if(i<10) {
			i= "0" + i
		}
		return i
	}

	const n = [addZero(endF.getHours()),addZero(endF.getMinutes())]

	return n.join(':')
}

form.elements.endDay.addEventListener('input', (e)=>{
	form.elements.endDayF.value = setEndDayF(e.target.value)
})

function setVisibility(elem) {
	const h=()=>{
		form.querySelector(`.${elem}_collapse`).hidden = !(form.elements[elem].value === 'true')
		if((form.elements[elem].value === 'true')){
			form.querySelector(`.${elem}_collapse`).style.animation = 'in 1s forwards'
		}
	}

	h()

	form.elements[elem].addEventListener('change', ()=>{
		if(!(form.elements[elem].value === 'true')){
			form.querySelector(`.${elem}_collapse`).style.animation = 'out 1s forwards'
			setTimeout(h, 1000)
		} else {
			h()
		}
	})
}

function updateTimerCollapse() {
	const show = form.elements.timer.value === 'true' || form.elements.headerEnabled.value === 'true';
	const collapse = form.querySelector('.timer_collapse');
	if (collapse) {
		collapse.hidden = !show;
		if (show) {
			collapse.style.animation = 'in 1s forwards';
		}
	}
}

function updateCompTabVisibility() {
	const select = form.elements.overtimeToComp;
	const compTabBtn = document.getElementById('tab-btn-comp');
	if (select && compTabBtn) {
		const isEnabled = select.value === 'true';
		compTabBtn.style.display = isEnabled ? '' : 'none';
		if (!isEnabled && compTabBtn.classList.contains('active')) {
			const generalTab = tabs[0];
			if (generalTab && generalTab.btn) {
				generalTab.btn.click();
			}
		}
	}
}

form.elements.timer.addEventListener('change', updateTimerCollapse);
form.elements.headerEnabled.addEventListener('change', updateTimerCollapse);
form.elements.overtimeToComp.addEventListener('change', updateCompTabVisibility);


function saveFieldData(field) {
	const elem = field.elements
	const res = {}

	for (const el of elem) {

			switch (el.localName) {
				case 'select':
					res[el.id]=el.value
					break
				case 'textarea':
					res[el.id]=el.value
					break
				case 'input':
				if (el.id === 'all') {break}
				if (el.type === 'checkbox') {
					if (!res[el.name]) res[el.name] = []
					if (el.checked) {
						res[el.name].push(el.value)
					}
				} else if (el.type === 'time') {
					if (!res[el.name]) res[el.name] = []
					res[el.name].push(el.value)
				} else if (el.type === 'color') {
					if (!res.colorTheme) res.colorTheme = {}
					res.colorTheme[el.name] = el.value
				} else {
					res[el.name] = el.value
				}
				break
			case 'button':
				break
			default:
				console.error('Что-то пошло не так, попробуй еще раз')
				break
		}
	}

	removeArray(res)

	return res
}

function removeArray(obj){
	for(const key in obj) {
		if(Array.isArray(obj[key])) {
			if(obj[key].length === 1){
				obj[key]=obj[key].toString()
			}
		} 
	}
}


function restoreSettings() {
	chrome.storage.local.get('formFields', function({formFields}) {
		if (!formFields) {
			formFields = getDefaultSettings();
			chrome.storage.local.set({formFields}, function(){})
		}

		for (const field in formFields) {
			for (const name in formFields[field]) {
				if(name === 'colorTheme'){
					for (const subName in formFields[field][name]) {
						form.elements[subName].value = formFields[field][name][subName]
					}
				}
				const elements = getFormElementsArray(name)
				if (elements.length === 0) continue

				const firstEl = elements[0]
				
				if (elements.length === 1 && firstEl.localName === 'select') {
					firstEl.value = formFields[field][name]
				} else if (elements.length === 1 && firstEl.localName === 'textarea') {
					firstEl.value = formFields[field][name] || ''
				} else if (elements.length === 1 && firstEl.localName === 'input' && firstEl.type !== 'checkbox') {
					firstEl.value = formFields[field][name]
				} else {
					elements.forEach(el => {
						const storedValues = Array.isArray(formFields[field][name]) 
							? formFields[field][name] 
							: [formFields[field][name]];
						if (storedValues.includes(el.value)) {
							el.checked = true
						} else {
							el.checked = false
						}
					})
				}
			}
		}

		for (const hideElem of toHide) {
			setVisibility(hideElem)
		}

		updateTimerCollapse()
		updateCompTabVisibility()

		check()
		initEmojiGrid()
	})
}

const reloadActiveTab = () => {
	chrome.tabs.query({active: true, currentWindow: true}, function(tabs){ 
		if(tabs[0] && self.DELPROP_HOSTS.allowedHostFragments.some(h => tabs[0].url.includes(h))) {
			chrome.tabs.reload(tabs[0].id)
		}
	})
}

form.save.addEventListener('click', (e)=>{
	e.preventDefault()

	chrome.storage.local.get(['formFields'], ({formFields: oldFormFields}) => {
		const formFields = {}
		form.querySelectorAll('fieldset').forEach(fs => {
			let key = fs.id + 'Field';
			if (fs.id === 'workTimerPortal' || fs.id === 'workTimerSettings') {
				key = 'workTimerField';
			}
			formFields[key] = {
				...(formFields[key] || {}),
				...saveFieldData(fs)
			}
		})

		// Keep all dismissed news IDs that were already in storage
		if (formFields.dellNewsField) {
			formFields.dellNewsField.newsList = oldFormFields?.dellNewsField?.newsList || [];
		}

		chrome.storage.local.set({formFields}, reloadActiveTab)
	});
})

form.restore.addEventListener('click', (e)=>{
	e.preventDefault()
	chrome.storage.local.set({formFields: getDefaultSettings()}, () => {
		chrome.storage.local.remove(['newsId'], () => {
			initEmojiGrid();
			reloadActiveTab();
		});
	})
})

form.mainColor.addEventListener('input', (el)=>{
	form.mainColorHover.value = colorLuminance((el.target.value), 0.75)
})

// Tab switching logic
const tabs = [
	{ btn: document.getElementById('tab-btn-general'), content: document.getElementById('tab-content-general') },
	{ btn: document.getElementById('tab-btn-archive'), content: document.getElementById('tab-content-archive') },
	{ btn: document.getElementById('tab-btn-comp'), content: document.getElementById('tab-content-comp') },
	{ btn: document.getElementById('tab-btn-settings'), content: document.getElementById('tab-content-settings') }
];

tabs.forEach(tab => {
	if (!tab.btn) return;
	tab.btn.addEventListener('click', () => {
		tabs.forEach(t => {
			if (!t.btn) return;
			if (t === tab) {
				t.btn.classList.add('active');
				t.btn.setAttribute('aria-selected', 'true');
				t.content.classList.remove('hidden');
			} else {
				t.btn.classList.remove('active');
				t.btn.setAttribute('aria-selected', 'false');
				t.content.classList.add('hidden');
			}
		});
		if (tab.btn.id === 'tab-btn-comp') {
			renderCompTime();
		}
	});
});

// Clear archive hashes logic
const clearHashesBtn = document.getElementById('clearHashes')
clearHashesBtn.addEventListener('click', () => {
	chrome.storage.local.remove('archiveHashes', () => {
		const originalText = clearHashesBtn.textContent
		clearHashesBtn.textContent = '✅ Очищено!'
		clearHashesBtn.disabled = true
		setTimeout(() => {
			clearHashesBtn.textContent = originalText
			clearHashesBtn.disabled = false
		}, 1500)
	})
})

// Clear tree cache logic
const clearTreeCacheBtn = document.getElementById('clearTreeCacheBtn')
if (clearTreeCacheBtn) {
	clearTreeCacheBtn.addEventListener('click', () => {
		chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
			if (tabs[0]) {
				chrome.tabs.sendMessage(tabs[0].id, { action: "clearTreeCache" });
			}
		});
		const originalText = clearTreeCacheBtn.textContent;
		clearTreeCacheBtn.textContent = '⚡ Кэш очищен!';
		clearTreeCacheBtn.disabled = true;
		setTimeout(() => {
			clearTreeCacheBtn.textContent = originalText;
			clearTreeCacheBtn.disabled = false;
		}, 1500);
	});
}

// Overtime / Comp Time logic
const monthNames = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const dayNames = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

// Current entry being edited (null = add mode). { key, list, manual }
let compEditingState = null;

function startEditingEntry(entry) {
	compEditingState = { key: entry.key, list: entry.list, manual: !!entry.manual };

	const manualForm = document.getElementById('manual-add-form');
	const manualDate = document.getElementById('manual-date');
	const manualFrom = document.getElementById('manual-time-from');
	const manualTo = document.getElementById('manual-time-to');
	const manualMoney = document.getElementById('manual-is-money');

	manualForm.style.display = 'block';
	manualDate.value = entry.key;
	const slots = entry.slots || [];
	manualFrom.value = minutesToTimeStr(slots.length ? slots[0] : null);
	manualTo.value = minutesToTimeStr(slots.length ? slots[slots.length - 1] + 1 : null);
	manualMoney.checked = entry.list === 'money';
	manualDate.focus();
}

function renderCompTime() {
	chrome.storage.local.get(['overtimeDays', 'paidOvertimeDays', 'carryOverMinutes', 'compGoalHours'], (data) => {
		const overtimeDays = data.overtimeDays || {};
		const paidOvertimeDays = data.paidOvertimeDays || {};
		const carryOverMinutes = data.carryOverMinutes || 0;
		const compGoalHours = data.compGoalHours || 0;

		const goalInput = document.getElementById('comp-goal-input');
		if (goalInput && !goalInput.dataset.listenerAdded) {
			goalInput.value = compGoalHours || '';
			goalInput.addEventListener('input', (e) => {
				const val = parseFloat(e.target.value) || 0;
				chrome.storage.local.set({ compGoalHours: val }, renderCompTime);
			});
			goalInput.dataset.listenerAdded = 'true';
		}

		const now = new Date();
		const thisMonthVal = `${now.getFullYear()}-${now.getMonth()}`;

		// Merge both lists into a unified view: each entry has a 'list' tag
		// 'comp' = отгулы, 'money' = за деньги
		const allEntries = [];
		Object.keys(overtimeDays).forEach(key => {
			allEntries.push({ key, list: 'comp', ...overtimeDays[key] });
		});
		Object.keys(paidOvertimeDays).forEach(key => {
			allEntries.push({ key, list: 'money', ...paidOvertimeDays[key] });
		});
		// Sort by date descending
		allEntries.sort((a, b) => b.key.localeCompare(a.key));

		// Populate month filter dropdown (union of months from both lists)
		const filterDropdown = document.getElementById('comp-month-filter');
		const prevSelected = filterDropdown.value || thisMonthVal;
		filterDropdown.innerHTML = '<option value="all">Все месяцы</option>';

		const monthsFound = new Set();
		allEntries.forEach(({ key }) => {
			const date = new Date(key);
			if (isNaN(date.getTime())) return;
			const monthYearVal = `${date.getFullYear()}-${date.getMonth()}`;
			if (!monthsFound.has(monthYearVal)) {
				monthsFound.add(monthYearVal);
				const opt = document.createElement('option');
				opt.value = monthYearVal;
				opt.textContent = `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
				filterDropdown.appendChild(opt);
			}
		});

		// Always include current month even if no data exists
		if (!monthsFound.has(thisMonthVal)) {
			const currentOpt = document.createElement('option');
			currentOpt.value = thisMonthVal;
			currentOpt.textContent = `${monthNames[now.getMonth()]} ${now.getFullYear()} (текущий)`;
			filterDropdown.appendChild(currentOpt);
		}

		// Default: current month (NOT 'all')
		const allValues = Array.from(filterDropdown.options).map(opt => opt.value);
		if (allValues.includes(prevSelected)) {
			filterDropdown.value = prevSelected;
		} else {
			filterDropdown.value = thisMonthVal;
		}

		// Render function
		const drawTable = () => {
			const filterVal = filterDropdown.value;
			const tbody = document.getElementById('comp-table-body');
			tbody.innerHTML = '';

			let thisMonthCompMin = 0;   // только текущий месяц по отгулам
			let totalCompMin = 0;        // накоплено за отгулы по всем месяцам
			let totalMoneyMin = 0;       // накоплено за деньги по всем месяцам

			allEntries.forEach(entry => {
				const dayData = entry;
				const date = new Date(entry.key);
				if (isNaN(date.getTime())) return;

				const monthYearVal = `${date.getFullYear()}-${date.getMonth()}`;

				// Stats
				if (entry.list === 'comp') {
					totalCompMin += dayData.minutes || 0;
					if (monthYearVal === thisMonthVal) {
						thisMonthCompMin += dayData.minutes || 0;
					}
				} else {
					totalMoneyMin += dayData.minutes || 0;
				}

				// Apply month filter to TABLE ONLY
				if (filterVal !== 'all' && monthYearVal !== filterVal) {
					return;
				}

				const tr = document.createElement('tr');
				if (entry.list === 'money') {
					tr.style.background = 'rgba(245, 158, 11, 0.06)';
					tr.title = 'Переработка за деньги';
				}
				if (entry.manual || entry.edited) {
					tr.style.borderLeft = '3px solid #f59e0b';
					tr.title = entry.edited ? 'Изменено вручную' : 'Ручная запись';
				}

				// Date column
				const dateTd = document.createElement('td');
				dateTd.textContent = date.toLocaleDateString('ru-RU');

				// Day of week
				const dayTd = document.createElement('td');
				dayTd.textContent = dayNames[date.getDay()];

				// Time worked
				const timeTd = document.createElement('td');
				timeTd.textContent = formatMinutes(dayData.minutes || 0);
				timeTd.style.fontWeight = '600';
				timeTd.style.color = entry.list === 'money' ? '#f59e0b' : 'var(--accent)';
				if (entry.manual || entry.edited) {
					const icon = document.createElement('span');
					icon.style.marginLeft = '4px';
					icon.title = entry.edited ? 'Изменено вручную' : 'Ручная запись';
					icon.textContent = '✏️';
					timeTd.appendChild(icon);
				}
				if (entry.list === 'money') {
					const badge = document.createElement('span');
					badge.style.marginLeft = '4px';
					badge.style.fontSize = '11px';
					badge.textContent = '💰';
					badge.title = 'За деньги';
					timeTd.appendChild(badge);
				}

				// Actions column (edit + move + delete)
				const actionTd = document.createElement('td');
				actionTd.style.textAlign = 'center';
				actionTd.style.whiteSpace = 'nowrap';

				// Edit button (available for ALL entries)
				const editBtn = document.createElement('button');
				editBtn.type = 'button';
				editBtn.className = 'comp-btn-delete';
				editBtn.style.marginRight = '4px';
				editBtn.innerHTML = '📝';
				editBtn.title = 'Изменить время этой записи';
				editBtn.addEventListener('click', () => startEditingEntry(entry));
				actionTd.appendChild(editBtn);

				// Move button (comp <-> money)
				const moveBtn = document.createElement('button');
				moveBtn.type = 'button';
				moveBtn.className = 'comp-btn-delete';
				moveBtn.style.marginRight = '4px';
				if (entry.list === 'comp') {
					moveBtn.innerHTML = '💰';
					moveBtn.title = 'Перенести в "За деньги"';
				} else {
					moveBtn.innerHTML = '📅';
					moveBtn.title = 'Перенести в "Отгулы"';
				}
				moveBtn.addEventListener('click', () => {
					const fromList = entry.list === 'comp' ? 'отгулы' : 'за деньги';
					const toList = entry.list === 'comp' ? 'за деньги' : 'отгулы';
					if (!confirm(`Перенести ${formatMinutes(dayData.minutes)} за ${date.toLocaleDateString('ru-RU')} из "${fromList}" в "${toList}"?`)) return;

					if (entry.list === 'comp') {
						delete overtimeDays[entry.key];
						paidOvertimeDays[entry.key] = { ...dayData };
					} else {
						delete paidOvertimeDays[entry.key];
						overtimeDays[entry.key] = { ...dayData };
					}
					chrome.storage.local.set({ overtimeDays, paidOvertimeDays }, renderCompTime);
				});
				actionTd.appendChild(moveBtn);

				// Delete button
				const delBtn = document.createElement('button');
				delBtn.type = 'button';
				delBtn.className = 'comp-btn-delete';
				delBtn.innerHTML = '🗑️';
				delBtn.title = 'Удалить эту запись';
				delBtn.addEventListener('click', () => {
					const listName = entry.list === 'comp' ? 'отгулов' : 'за деньги';
					if (confirm(`Удалить переработку за ${date.toLocaleDateString('ru-RU')} из списка ${listName}?`)) {
						if (entry.list === 'comp') {
							delete overtimeDays[entry.key];
						} else {
							delete paidOvertimeDays[entry.key];
						}
						chrome.storage.local.get(['deletedOvertimeDays'], (dData) => {
							const deleted = dData.deletedOvertimeDays || [];
							if (!deleted.includes(entry.key)) {
								deleted.push(entry.key);
							}
							chrome.storage.local.set({ overtimeDays, paidOvertimeDays, deletedOvertimeDays: deleted }, renderCompTime);
						});
					}
				});
				actionTd.appendChild(delBtn);

				tr.appendChild(dateTd);
				tr.appendChild(dayTd);
				tr.appendChild(timeTd);
				tr.appendChild(actionTd);

				tbody.appendChild(tr);
			});

			// If table is empty
			if (tbody.children.length === 0) {
				const tr = document.createElement('tr');
				const td = document.createElement('td');
				td.colSpan = 4;
				td.style.textAlign = 'center';
				td.style.color = 'var(--text-muted)';
				td.style.padding = '20px 0';
				td.textContent = 'Нет записей о переработках';
				tr.appendChild(td);
				tbody.appendChild(tr);
			}

			// Update summary cards
			// "Всего накоплено" = начальный баланс + текущий месяц (по отгулам)
			const grandTotalMin = carryOverMinutes + thisMonthCompMin;
			document.getElementById('comp-carryover').textContent = formatMinutes(carryOverMinutes);
			document.getElementById('comp-total').textContent = formatMinutes(grandTotalMin);
			document.getElementById('comp-month').textContent = formatMinutes(thisMonthCompMin);
			document.getElementById('comp-money').textContent = formatMinutes(totalMoneyMin);

			const goalStatusEl = document.getElementById('comp-goal-status');
			if (goalStatusEl) {
				const goalVal = parseFloat(goalInput?.value) || 0;
				if (goalVal > 0) {
					const goalMin = goalVal * 60;
					const remainingMin = goalMin - grandTotalMin;
					if (remainingMin <= 0) {
						goalStatusEl.style.color = '#10b981';
						goalStatusEl.textContent = `🎉 Цель (${goalVal}ч) достигнута!`;
					} else {
						goalStatusEl.style.color = 'var(--accent)';
						goalStatusEl.textContent = `Осталось до цели: ${formatMinutes(remainingMin)}`;
					}
				} else {
					goalStatusEl.textContent = '';
				}
			}

			// Also recalc money badge
			const compMoneyTotal = document.getElementById('comp-money');
			if (compMoneyTotal) compMoneyTotal.textContent = formatMinutes(totalMoneyMin);
		};

		drawTable();

		// Event listener for filter change
		if (!filterDropdown.dataset.listenerAdded) {
			filterDropdown.addEventListener('change', drawTable);
			filterDropdown.dataset.listenerAdded = 'true';
		}

		// Wire up manual add/edit form (once)
		if (!document.getElementById('addManualBtn').dataset.wired) {
			document.getElementById('addManualBtn').dataset.wired = 'true';
			const addManualBtn = document.getElementById('addManualBtn');
			const manualForm = document.getElementById('manual-add-form');
			const manualDate = document.getElementById('manual-date');
			const manualFrom = document.getElementById('manual-time-from');
			const manualTo = document.getElementById('manual-time-to');
			const manualMoney = document.getElementById('manual-is-money');
			const manualSaveBtn = document.getElementById('manual-save-btn');
			const manualCancelBtn = document.getElementById('manual-cancel-btn');

			// Pre-fill date to today
			manualDate.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

			addManualBtn.addEventListener('click', () => {
				manualForm.style.display = manualForm.style.display === 'none' ? 'block' : 'none';
				compEditingState = null;
				if (manualForm.style.display === 'block') {
					manualDate.focus();
				}
			});

			manualCancelBtn.addEventListener('click', () => {
				manualForm.style.display = 'none';
				compEditingState = null;
			});

			manualSaveBtn.addEventListener('click', () => {
				const dateStr = manualDate.value; // YYYY-MM-DD
				const fromMin = parseTimeToMinutes(manualFrom.value);
				const toMin = parseTimeToMinutes(manualTo.value);
				const isMoney = manualMoney.checked;
				const editing = compEditingState;
				compEditingState = null;

				if (!dateStr || fromMin === null || toMin === null || toMin <= fromMin) {
					alert('Проверьте дату и время: конец должен быть позже начала.');
					return;
				}

				const minutes = toMin - fromMin;
				const slots = Array.from({ length: minutes }, (_, i) => fromMin + i);

				// Read fresh data so repeated edits don't work with stale copies
				chrome.storage.local.get(['overtimeDays', 'paidOvertimeDays'], (fresh) => {
					const overtimeDays = fresh.overtimeDays || {};
					const paidOvertimeDays = fresh.paidOvertimeDays || {};

					const entry = { minutes, slots, manual: true };
					if (editing) {
						// Edited entry keeps its origin but is protected from auto-import overwrite
						entry.manual = editing.manual;
						entry.edited = true;
						if (editing.list === 'comp') {
							delete overtimeDays[editing.key];
						} else {
							delete paidOvertimeDays[editing.key];
						}
					}

					if (isMoney) {
						paidOvertimeDays[dateStr] = entry;
					} else {
						overtimeDays[dateStr] = entry;
					}

					chrome.storage.local.set({ overtimeDays, paidOvertimeDays }, () => {
						manualForm.style.display = 'none';
						manualMoney.checked = false;
						renderCompTime();
					});
				});
			});
		}
	});
}

// Reset all comp time listener
document.getElementById('clearCompDb').addEventListener('click', () => {
	if (confirm('Вы уверены, что хотите полностью стереть всю историю переработок?')) {
		chrome.storage.local.get(['overtimeDays', 'deletedOvertimeDays'], (data) => {
			const overtimeDays = data.overtimeDays || {};
			const deleted = data.deletedOvertimeDays || [];
			Object.keys(overtimeDays).forEach(key => {
				if (!deleted.includes(key)) {
					deleted.push(key);
				}
			});
			chrome.storage.local.set({ deletedOvertimeDays: deleted });
			chrome.storage.local.remove('overtimeDays', renderCompTime);
		});
	}
});

// Export to Excel listener
document.getElementById('exportExcelBtn').addEventListener('click', () => {
	exportToExcel();
});

function exportToExcel() {
	const filterDropdown = document.getElementById('comp-month-filter');
	if (!filterDropdown) return;
	const selectedVal = filterDropdown.value;
	
	if (selectedVal === 'all') {
		alert('Выберите конкретный месяц для экспорта таблицы за этот месяц.');
		return;
	}

	chrome.storage.local.get(['overtimeDays', 'user'], (data) => {
		const overtimeDays = data.overtimeDays || {};
		const user = data.user || {};
		const employeeName = user.fio || 'Сотрудник';

		const parts = selectedVal.split('-');
		const year = parseInt(parts[0], 10);
		const monthIndex = parseInt(parts[1], 10); // 0-based: 0=Январь, 11=Декабрь

		const monthsRU = [
			"Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
			"Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
		];
		const monthNameRU = monthsRU[monthIndex];

		const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
		const weekdays = [];
		const weekdayNamesRU = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

		for (let d = 1; d <= daysInMonth; d++) {
			const dateObj = new Date(year, monthIndex, d);
			const dayOfWeek = dateObj.getDay();
			if (dayOfWeek !== 0 && dayOfWeek !== 6) {
				weekdays.push({
					day: d,
					dateObj: dateObj,
					weekdayStr: weekdayNamesRU[dayOfWeek]
				});
			}
		}

		// STYLES DEFINITION
		const borderThin = {
			top: { style: 'thin', color: { rgb: '000000' } },
			bottom: { style: 'thin', color: { rgb: '000000' } },
			left: { style: 'thin', color: { rgb: '000000' } },
			right: { style: 'thin', color: { rgb: '000000' } }
		};

		const styleTitle = {
			font: { name: 'Arial', sz: 12, bold: true },
			alignment: { horizontal: 'left', vertical: 'center' }
		};

		const styleHeaderMerged = {
			font: { name: 'Arial', sz: 10, bold: true },
			alignment: { horizontal: 'center', vertical: 'center' },
			fill: { fgColor: { rgb: 'EAEAEA' } },
			border: borderThin
		};

		const styleHeaderSub = {
			font: { name: 'Arial', sz: 10, bold: true },
			alignment: { horizontal: 'center', vertical: 'center' },
			fill: { fgColor: { rgb: 'EAEAEA' } },
			border: borderThin
		};

		const styleDataText = {
			font: { name: 'Arial', sz: 10 },
			alignment: { horizontal: 'center', vertical: 'center' },
			border: borderThin
		};

		const styleTotalLabel = {
			font: { name: 'Arial', sz: 10, bold: true },
			alignment: { horizontal: 'right', vertical: 'center' },
			border: borderThin
		};

		const styleTotalValue = {
			font: { name: 'Arial', sz: 10, bold: true },
			alignment: { horizontal: 'center', vertical: 'center' },
			border: borderThin
		};

		const sheetData = {};

		// Row 1
		sheetData['A1'] = { v: employeeName, t: 's', s: styleTitle };
		sheetData['C1'] = { v: 'Время в отгулы', t: 's', s: styleHeaderMerged };
		// Merge cells C1:E1, so we should style D1 and E1 headers too for consistent border rendering
		sheetData['D1'] = { v: '', t: 's', s: styleHeaderMerged };
		sheetData['E1'] = { v: '', t: 's', s: styleHeaderMerged };

		// Row 2
		sheetData['A2'] = { v: 'Дата', t: 's', s: styleHeaderSub };
		sheetData['B2'] = { v: 'День', t: 's', s: styleHeaderSub };
		sheetData['C2'] = { v: 'Начало', t: 's', s: styleHeaderSub };
		sheetData['D2'] = { v: 'Конец', t: 's', s: styleHeaderSub };
		sheetData['E2'] = { v: 'Сумма', t: 's', s: styleHeaderSub };

		let totalDurationMin = 0;

		weekdays.forEach((wd, index) => {
			const rowIndex = 3 + index;
			const yyyy = year;
			const mm = String(monthIndex + 1).padStart(2, '0');
			const dd = String(wd.day).padStart(2, '0');
			const dateKey = `${yyyy}-${mm}-${dd}`;

			const excelEpoch = new Date(1899, 11, 30).getTime();
			const serialDate = Math.round((wd.dateObj.getTime() - excelEpoch) / (24 * 60 * 60 * 1000));

			sheetData[`A${rowIndex}`] = { v: serialDate, t: 'n', z: 'dd.mm.yyyy', s: styleDataText };
			sheetData[`B${rowIndex}`] = { v: wd.weekdayStr, t: 's', s: styleDataText };

			const dayData = overtimeDays[dateKey];
			if (dayData && dayData.minutes > 0 && dayData.slots && dayData.slots.length > 0) {
				const startMin = dayData.slots[0];
				const endMin = dayData.slots[dayData.slots.length - 1] + 1;
				const durationMin = dayData.minutes;

				totalDurationMin += durationMin;

				sheetData[`C${rowIndex}`] = { v: startMin / 1440, t: 'n', z: 'hh:mm', s: styleDataText };
				sheetData[`D${rowIndex}`] = { v: endMin / 1440, t: 'n', z: 'hh:mm', s: styleDataText };
				sheetData[`E${rowIndex}`] = { v: durationMin / 1440, t: 'n', z: 'hh:mm', s: styleDataText };
			} else {
				sheetData[`C${rowIndex}`] = { v: '', t: 's', s: styleDataText };
				sheetData[`D${rowIndex}`] = { v: '', t: 's', s: styleDataText };
				sheetData[`E${rowIndex}`] = { v: '', t: 's', s: styleDataText };
			}
		});

		const lastDataRow = 2 + weekdays.length;
		
		// Total row
		const totalRowIndex = lastDataRow + 2;
		sheetData[`A${totalRowIndex}`] = { v: '', t: 's', s: styleTotalLabel };
		sheetData[`B${totalRowIndex}`] = { v: '', t: 's', s: styleTotalLabel };
		sheetData[`C${totalRowIndex}`] = { v: '', t: 's', s: styleTotalLabel };
		sheetData[`D${totalRowIndex}`] = { v: 'ИТОГ', t: 's', s: styleTotalLabel };
		sheetData[`E${totalRowIndex}`] = { 
			f: `SUM(E3:E${lastDataRow})`, 
			v: totalDurationMin / 1440, 
			t: 'n', 
			z: '[h]:mm', 
			s: styleTotalValue 
		};

		// Signature blocks
		const nameRowIndex = totalRowIndex + 2;
		sheetData[`A${nameRowIndex}`] = { v: employeeName, t: 's', s: { font: { name: 'Arial', sz: 11 } } };
		const borderBottomOnly = {
			bottom: { style: 'thin', color: { rgb: '000000' } }
		};
		sheetData[`D${nameRowIndex}`] = { v: '', t: 's', s: { border: borderBottomOnly } };
		sheetData[`E${nameRowIndex}`] = { v: '', t: 's', s: { border: borderBottomOnly } };

		const dateRowIndex = nameRowIndex + 1;
		sheetData[`D${dateRowIndex}`] = { v: '', t: 's', s: { border: borderBottomOnly } };
		sheetData[`E${dateRowIndex}`] = { v: '', t: 's', s: { border: borderBottomOnly } };

		sheetData['!ref'] = `A1:E${dateRowIndex}`;

		// Merges list
		sheetData['!merges'] = [
			{ s: { r: 0, c: 2 }, e: { r: 0, c: 4 } }, // C1:E1
			{ s: { r: nameRowIndex - 1, c: 0 }, e: { r: nameRowIndex - 1, c: 2 } }, // A29:C29
			{ s: { r: nameRowIndex - 1, c: 3 }, e: { r: nameRowIndex - 1, c: 4 } }, // D29:E29
			{ s: { r: dateRowIndex - 1, c: 3 }, e: { r: dateRowIndex - 1, c: 4 } }  // D30:E30
		];

		sheetData['!cols'] = [
			{ wch: 12 },
			{ wch: 6 },
			{ wch: 10 },
			{ wch: 10 },
			{ wch: 10 }
		];

		const wb = XLSX.utils.book_new();
		wb.SheetNames.push('Лист1');
		wb.Sheets['Лист1'] = sheetData;

		const filename = `${employeeName} ${monthNameRU} ${year}. (Время отгулов).xlsx`;
		XLSX.writeFile(wb, filename);
	});
}

function initEmojiGrid() {
	const grid = document.getElementById('emoji-grid');
	const input = document.getElementById('userIcon');
	if (!grid || !input) return;

	grid.innerHTML = '';
	const availableEmojis = [
		'👤', '⚡', '😈', '👹', '👾', '🤖', '🐱', '🐶', '🍺', '🚀', '🐸', '🐼',
		'🦊', '🐻', '🦁', '🐷', '🐒', '🦄', '🐉', '🍕', '🍔', '🍩', '🎮', '🎸',
		'👑', '👽', '👻', '💀', '💥', '🔥', '❤️', '🌟', '🍀', '💎', '☯️', '🧿',
		'🌀', '🎭', '🔮'
	];
	
	availableEmojis.forEach(emoji => {
		const span = document.createElement('span');
		span.className = 'emoji-item';
		span.textContent = emoji;
		if (input.value === emoji) {
			span.classList.add('selected');
		}
		span.addEventListener('click', () => {
			grid.querySelectorAll('.emoji-item').forEach(el => el.classList.remove('selected'));
			span.classList.add('selected');
			input.value = emoji;
		});
		grid.appendChild(span);
	});
}

document.getElementById('restoreNewsBtn').addEventListener('click', () => {
	chrome.storage.local.get(['formFields'], ({ formFields }) => {
		formFields = formFields || {};
		formFields.dellNewsField = formFields.dellNewsField || {};
		formFields.dellNewsField.newsList = [];
		chrome.storage.local.set({ formFields }, () => {
			alert('Скрытые новости успешно восстановлены. Обновите страницу портала, чтобы увидеть их.');
			reloadActiveTab();
		});
	});
});

document.addEventListener('DOMContentLoaded', restoreSettings)