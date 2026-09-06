(() => {
	window.delProp = window.delProp || {};

	function initAdminPatch() {
		const isAdminField = window.delProp.settings?.mainUserField?.isAdmin;
		const isAdmin = /^true$/i.test(isAdminField);
		
		const s = document.createElement("script");
		s.type = "text/javascript";
		s.dataset.isAdmin = Number(isAdmin);
		s.dataset.activityEndpoint = (self.DELPROP_HOSTS && self.DELPROP_HOSTS.activityEndpoint) || "";
		s.src = chrome.runtime.getURL('patch/patch.js');
		if (document.body) {
			document.body.append(s);
		} else {
			document.documentElement.appendChild(s);
		}
	}

	function initEmptyDivCleaner() {
		if (document.body) {
			Array.from(document.body.childNodes).forEach(node => {
				if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() === "") {
					node.remove();
				}
			});
		}

		window.delProp.registerMutationHandler({
			name: 'emptyDivCleaner',
			checkMutation: (mutation) => {
				if (mutation.addedNodes) {
					for (const node of mutation.addedNodes) {
						if (node.nodeType === Node.ELEMENT_NODE && node.localName === 'div' && node.innerHTML === "" && node.className === "") {
							node.remove();
						} else if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() === "") {
							node.remove();
						}
					}
				}
			}
		});
	}

	function initAntiSnow() {
		const styleField = window.delProp.settings?.styleField || {};
		if (styleField.styled === 'true' && styleField.snow === 'on') {
			const cleanSnow = () => {
				document.head.querySelectorAll('script').forEach(script => {
					if (script.src && script.src.includes('snow')) {
						script.remove();
					}
				});
				document.body.querySelectorAll('span').forEach(sp => {
					if (sp.id && sp.id.includes('s')) {
						sp.remove();
					}
				});
			};
			cleanSnow();
			window.delProp.registerMutationHandler({
				name: 'antiSnowRemover',
				check: (node) => node && (node.localName === 'script' || node.localName === 'span'),
				callback: (node) => {
					if (node.localName === 'script' && node.src && node.src.includes('snow')) {
						node.remove();
					}
					if (node.localName === 'span' && node.id && node.id.includes('s')) {
						node.remove();
					}
				}
			});
		}
	}

	function initSiteFilters() {
		const styleField = window.delProp.settings?.styleField || {};
		if (styleField.styled === 'true' && styleField.filter && styleField.filter !== 'none') {
			const filterVal = styleField.filter;
			if (filterVal === 'invert(1)') {
				document.body.style.filter = 'invert(1)';
				document.body.classList.add('delprop-inverted');
			} else {
				document.body.style.setProperty('--delprop-filter', filterVal);
				document.body.classList.add('delprop-filtered');
			}
		}
	}

	function initKadrClickHandlers() {
		window.delProp.registerMutationHandler({
			name: 'kadrLayoutObserver',
			check: (node) => node && node.classList && node.classList.contains('dhx_dataview'),
			callback: (imgContainer) => {
				const imageObserver = new MutationObserver(mutations => {
					let srcs = [];
					for (let mutation of mutations) {
						for (let item of mutation.addedNodes) {
							const img = item?.querySelector && item.querySelector('img');
							if (img && img.parentNode && img.parentNode.href) {
								const link = img.parentNode;
								const srcMatch = img.src.match(/kadr\/(\d+)\.jpg/);
								if (srcMatch) {
									const src = srcMatch[1];
									srcs.push(Number(src));
									link.href = '#';
									link.removeAttribute("target");
									link.onclick = (e) => {
										e.preventDefault();
										window.delProp.openModal(img.src);
									};
								}
							}
						}
					}
					if (srcs.length > 0) {
						chrome.storage.local.set({ maxSrc: Math.max(...srcs) });
					}
				});
				imageObserver.observe(imgContainer, { childList: true, subtree: true });
			}
		});
	}

	// User dataset observer (parsed and saved to storage)
	window.delProp.registerMutationHandler({
		name: 'userDetector',
		check: (node) => node && node.dataset && node.dataset.user,
		callback: (node) => {
			try {
				const user = JSON.parse(node.dataset.user);
				const user_input = node.dataset.input;
				chrome.storage.local.set({ user }, () => {
					window.delProp.user = user;
				});
				chrome.storage.local.set({ user_input }, () => {
					window.delProp.user_input = user_input;
				});

				if (node.dataset.activity) {
					try {
						const activityRows = JSON.parse(node.dataset.activity);
						processActivityOvertimes(activityRows);
					} catch (err) {
						console.error("delProp: error parsing activity logs:", err);
					}
				}
			} catch (e) {
				console.error("delProp: error parsing user dataset:", e);
			}
		}
	});

	function initAnyImageModal() {
		document.addEventListener('click', (e) => {
			const img = e.target.closest('img');
			if (!img) return;

			// Don't open if it's already inside a modal
			if (img.closest('#modal')) return;

			// Ignore tiny decorative icons (width or height <= 32px)
			const w = img.naturalWidth || img.offsetWidth;
			const h = img.naturalHeight || img.offsetHeight;
			if (w <= 32 || h <= 32) return;

			e.preventDefault();
			e.stopPropagation();
			window.delProp.openModal(img.src);
		}, true); // use capture phase
	}

	function processActivityOvertimes(rows) {
		const settings = window.delProp.settings;
		if (!settings || !settings.workTimerField || settings.workTimerField.overtimeToComp !== 'true') return;

		const start = settings.workTimerField.startDay || '07:00';
		const end = settings.workTimerField.endDay || '16:00';
		const endF = settings.workTimerField.endDayF || '14:45';

		const startMin = window.delProp.helpers.parseTimeToMinutes(start);
		const endMin = window.delProp.helpers.parseTimeToMinutes(end);
		const endFMin = window.delProp.helpers.parseTimeToMinutes(endF);

		if (startMin === null || endMin === null || endFMin === null) return;

		chrome.storage.local.get(['overtimeDays', 'paidOvertimeDays', 'deletedOvertimeDays'], (data) => {
			const overtimeDays = data.overtimeDays || {};
			const paidOvertimeDays = data.paidOvertimeDays || {};
			const deletedOvertimeDays = data.deletedOvertimeDays || [];
			let changed = false;

			rows.forEach(row => {
				if (!row.data || row.data.length < 4) return;

				// Find the date string (e.g. "02.07.2026")
				const dateStr = row.data.find(val => typeof val === 'string' && /^\d{2}\.\d{2}\.\d{4}$/.test(val));
				if (!dateStr) return;

				// format key for storage as YYYY-MM-DD
				const parts = dateStr.split('.');
				const storageKey = `${parts[2]}-${parts[1]}-${parts[0]}`;

				// If day was explicitly deleted by the user, do not re-import it
				if (deletedOvertimeDays.includes(storageKey)) return;

				// If day was moved to "За деньги" (paidOvertimeDays), it must not be
				// re-imported into отгулы. Also drop any stray duplicate left in overtimeDays.
				if (paidOvertimeDays[storageKey]) {
					if (overtimeDays[storageKey]) {
						delete overtimeDays[storageKey];
						changed = true;
					}
					return;
				}

				const loginTime = row.data.at(2);
				const logoutTime = row.data.at(3);

				if (!loginTime || !logoutTime) return;

				const loginMin = window.delProp.helpers.parseTimeToMinutes(loginTime);
				const logoutMin = window.delProp.helpers.parseTimeToMinutes(logoutTime);

				if (loginMin === null || logoutMin === null) return;

				// Parse date to check day of week
				const dateObj = new Date(parts[2], parts[1] - 1, parts[0]);
				const dayOfWeek = dateObj.getDay();

				if (dayOfWeek === 0) return; // Skip Sunday

				const maxLogoutMin = 19 * 60;
				const effectiveLogoutMin = Math.min(logoutMin, maxLogoutMin);
				let overtimeMin = 0;
				let targetEndMin = 0;

				if (dayOfWeek === 6) {
					// Saturday: all worked time up to 19:00 counts as overtime
					targetEndMin = loginMin;
					overtimeMin = Math.max(0, effectiveLogoutMin - loginMin);
				} else {
					// Weekday: Calculate end of work day with lateness adjustments
					targetEndMin = (dayOfWeek === 5) ? endFMin : endMin;
					let latenessMin = loginMin - startMin;

					if (latenessMin > 0 && latenessMin <= 30) {
						targetEndMin += latenessMin;
					}
					overtimeMin = effectiveLogoutMin - targetEndMin;
				}

				if (overtimeMin > 0) {
					// Never overwrite an entry the user has edited manually
					if (!overtimeDays[storageKey]) {
						overtimeDays[storageKey] = {
							minutes: overtimeMin,
							slots: Array.from({ length: overtimeMin }, (_, i) => targetEndMin + i)
						};
						changed = true;
					} else if (!overtimeDays[storageKey].edited && overtimeDays[storageKey].minutes !== overtimeMin) {
						overtimeDays[storageKey] = {
							minutes: overtimeMin,
							slots: Array.from({ length: overtimeMin }, (_, i) => targetEndMin + i)
						};
						changed = true;
					}
				} else {
					if (overtimeDays[storageKey] && !overtimeDays[storageKey].edited) {
						delete overtimeDays[storageKey];
						changed = true;
					}
				}
			});

			// Parse monthly carry-over balance (отгулы на начало месяца) from the last row if present
			if (rows.length > 0) {
				const lastRow = rows[rows.length - 1];
				if (lastRow && lastRow.data && lastRow.data.length >= 2) {
					const hasDate = lastRow.data.some(val => typeof val === 'string' && /^\d{2}\.\d{2}\.\d{4}$/.test(val));
					if (!hasDate) {
						const carryOverVal = lastRow.data[lastRow.data.length - 2];
						const carryOverMin = parseCarryOverMinutes(carryOverVal);
						chrome.storage.local.set({ carryOverMinutes: carryOverMin });
					}
				}
			}

			if (changed) {
				chrome.storage.local.set({ overtimeDays });
			}
		});
	}

	function parseCarryOverMinutes(val) {
		if (val === undefined || val === null) return 0;
		const str = String(val).trim().replace(/\s+/g, '');
		if (!str) return 0;

		const isNegative = str.startsWith('-');
		const absoluteStr = isNegative ? str.substring(1) : str;

		let minutes = 0;
		if (absoluteStr.includes(':')) {
			const parts = absoluteStr.split(':');
			const h = parseInt(parts[0], 10) || 0;
			const m = parseInt(parts[1], 10) || 0;
			minutes = h * 60 + m;
		} else {
			const floatVal = parseFloat(absoluteStr.replace(',', '.'));
			if (!isNaN(floatVal)) {
				minutes = Math.round(floatVal * 60);
			}
		}

		return isNegative ? -minutes : minutes;
	}

	window.delProp.onCoreReady(() => {
		initAdminPatch();
		initEmptyDivCleaner();
		initAntiSnow();
		initSiteFilters();
		initKadrClickHandlers();
		initAnyImageModal();
	});
})();
