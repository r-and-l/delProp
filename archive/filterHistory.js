// archive/filterHistory.js
// Shell-style search history for the archive project filter.
// Arrow Up/Down navigates through past queries, Enter saves to history.
// Each history entry stores the tab id where it was used ({ q, tab }).

(function() {
	const MAX_HISTORY = 50;
	let history = []; // array of { q: string, tab: string|null }
	let historyIndex = -1;
	let currentUnsaved = '';

	// Normalize storage entries: old string entries get { q, tab: null }
	function normalizeEntry(entry) {
		if (typeof entry === 'string') return { q: entry, tab: null };
		return entry;
	}

	function getQuery(entry) {
		return normalizeEntry(entry).q;
	}

	function getTab(entry) {
		return normalizeEntry(entry).tab || null;
	}

	function safeHistoryGet() {
		try {
			chrome.storage.local.get(['archiveFilterHistory'], (data) => {
				history = (data.archiveFilterHistory || []).map(normalizeEntry);
			});
		} catch (e) {
			console.warn('delProp: extension context invalidated, using empty history');
			history = [];
		}
	}

	function safeHistorySet() {
		try {
			chrome.storage.local.set({ archiveFilterHistory: history });
		} catch (e) {
			console.warn('delProp: extension context invalidated, history not persisted');
		}
	}

	// Get the name of the currently active tab as displayed in the tab bar
	function getActiveTabName() {
		const actvTab = document.querySelector('.dhxtabbar_tab.dhxtabbar_tab_actv');
		if (!actvTab) return null;
		if (typeof window.getTabName === 'function') {
			return window.getTabName(actvTab) || null;
		}
		const text = actvTab.innerText || actvTab.textContent;
		return text ? text.trim() : null;
	}

	// Find tab ID by its display name via the page context
	function findTabIdByName(name, callback) {
		const requestId = 'delprop_find_tab_' + Date.now() + '_' + Math.random().toString(36).slice(2);
		const handler = (e) => {
			if (e.detail && e.detail.requestId === requestId && e.detail.action === 'findTabResult') {
				document.removeEventListener('delPropResponse', handler);
				callback(e.detail.tabId || null);
			}
		};
		document.addEventListener('delPropResponse', handler);
		document.dispatchEvent(new CustomEvent('delPropRequest', {
			detail: { action: 'findTabByName', tabName: name, requestId }
		}));
		// Timeout fallback
		setTimeout(() => {
			document.removeEventListener('delPropResponse', handler);
			callback(null);
		}, 500);
	}

	// Switch to a tab by ID via the page context
	function switchToTab(tabId) {
		document.dispatchEvent(new CustomEvent('delPropRequest', {
			detail: { action: 'switchToTab', tabId }
		}));
	}

	window.initFilterHistory = function(searchInput) {
		safeHistoryGet();

		searchInput.addEventListener('keydown', (e) => {
			// Only handle history navigation when autocomplete dropdown is NOT visible
			const dropdown = document.querySelector('.delprop-autocomplete-dropdown');
			if (dropdown && dropdown.style.display !== 'none' && dropdown.children.length > 0) {
				return; // Let autocomplete handle arrow keys
			}

			if (e.key === 'ArrowUp') {
				e.preventDefault();
				if (history.length === 0) return;
				if (historyIndex === -1) {
					currentUnsaved = searchInput.value;
				}
				if (historyIndex < history.length - 1) {
					historyIndex++;
					if (typeof window.suppressAutocomplete === 'function') {
						window.suppressAutocomplete();
					}
					const entry = history[history.length - 1 - historyIndex];
					searchInput.value = getQuery(entry);
					searchInput.dispatchEvent(new Event('input'));
				}
			} else if (e.key === 'ArrowDown') {
				e.preventDefault();
				if (historyIndex > 0) {
					historyIndex--;
					if (typeof window.suppressAutocomplete === 'function') {
						window.suppressAutocomplete();
					}
					const entry = history[history.length - 1 - historyIndex];
					searchInput.value = getQuery(entry);
					searchInput.dispatchEvent(new Event('input'));
				} else if (historyIndex === 0) {
					historyIndex = -1;
					if (typeof window.suppressAutocomplete === 'function') {
						window.suppressAutocomplete();
					}
					searchInput.value = currentUnsaved;
					searchInput.dispatchEvent(new Event('input'));
				}
			}
		});
	};

	window.saveToFilterHistory = function(query) {
		if (!query || !query.trim()) return;
		const trimmed = query.trim();
		const entry = { q: trimmed, tab: getActiveTabName() };

		// Don't duplicate the last entry
		if (history.length > 0 && getQuery(history[history.length - 1]) === trimmed) return;

		// Remove earlier duplicate queries (move to end)
		const existingIdx = history.findIndex(h => getQuery(h) === trimmed);
		if (existingIdx !== -1) {
			history.splice(existingIdx, 1);
		}
		history.push(entry);

		if (history.length > MAX_HISTORY) {
			history = history.slice(-MAX_HISTORY);
		}
		historyIndex = -1;
		currentUnsaved = '';

		safeHistorySet();
	};

	window.resetFilterHistoryIndex = function() {
		historyIndex = -1;
		currentUnsaved = '';
	};
})();
