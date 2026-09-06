// archive/patch.js
(function() {
	const RealOpen = XMLHttpRequest.prototype.open;
	const RealSend = XMLHttpRequest.prototype.send;

	XMLHttpRequest.prototype.open = function(method, url, ...args) {
		this._delpropMethod = method;
		this._delpropUrl = url;
		this._delpropIsCacheable = false;
		
		if (method.toUpperCase() === 'GET' && url.includes('show_tree.php')) {
			try {
				const urlObj = new URL(url, window.location.href);
				const nodeId = urlObj.searchParams.get('id') || '';
				if (nodeId && (nodeId.startsWith('project_') || nodeId === '0' || nodeId === 'root')) {
					this._delpropIsCacheable = true;
					this._delpropNodeId = nodeId;
					this._delpropCacheKey = 'delprop_tree_cache_' + nodeId;
				}
			} catch (e) {
				console.error("delProp: error parsing tree URL:", e);
			}
		}
		return RealOpen.apply(this, [method, url, ...args]);
	};

	XMLHttpRequest.prototype.send = function(body) {
		const isCacheEnabled = document.documentElement.dataset.delpropCacheEnabled !== 'false';

		if (this._delpropIsCacheable && isCacheEnabled) {
			const cacheKey = this._delpropCacheKey;
			const nodeId = this._delpropNodeId;
			const url = this._delpropUrl;

			// The whole cache path is wrapped: if anything goes wrong (blocked or
			// quota'd localStorage, broken cache entry, property redefinition
			// failure), we MUST fall back to the real network request instead of
			// blocking archive loading entirely.
			try {
				const cachedData = localStorage.getItem(cacheKey);

				if (cachedData) {
					const parsed = JSON.parse(cachedData);
					const TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
					if (Date.now() - parsed.timestamp < TTL) {
						const parsedDoc = new DOMParser().parseFromString(parsed.data, 'text/xml');
						const props = {
							responseText: { value: parsed.data, writable: true },
							responseXML: { value: parsedDoc, writable: true },
							status: { value: 200, writable: true },
							statusText: { value: 'OK', writable: true },
							readyState: { value: 4, writable: true }
						};
						// Mirror the response property the way the page expects it
						if (this.responseType === '' || this.responseType === 'text') {
							props.response = { value: parsed.data, writable: true };
						} else if (this.responseType === 'document') {
							props.response = { value: parsedDoc, writable: true };
						}
						Object.defineProperties(this, props);

						setTimeout(() => {
							if (typeof this.onreadystatechange === 'function') {
								this.onreadystatechange();
							}
							this.dispatchEvent(new Event('readystatechange'));
							this.dispatchEvent(new Event('load'));
						}, 0);

						// Background revalidation (Stale-While-Revalidate)
						setTimeout(() => {
							revalidateCache(url, cacheKey, nodeId);
						}, 100);
						return;
					}
				}
			} catch (e) {
				console.error("delProp: tree cache unavailable, falling back to network:", e);
				// Fall through to the real request below — never block the archive.
			}

			this.addEventListener('load', () => {
				try {
					if (this.status === 200 && this.responseType === '' && this.responseText) {
						localStorage.setItem(cacheKey, JSON.stringify({
							timestamp: Date.now(),
							data: this.responseText
						}));
					}
				} catch (e) {
					console.error("delProp: error caching tree data:", e);
				}
			});
		}
		return RealSend.apply(this, [body]);
	};

	function revalidateCache(url, key, id) {
		fetch(url)
			.then(r => r.arrayBuffer())
			.then(buf => {
				// Server returns windows-1251 encoded XML; decode properly
				const decoder = new TextDecoder('windows-1251');
				const newXml = decoder.decode(buf);
				const cachedObjStr = localStorage.getItem(key);
				let cachedXml = '';
				if (cachedObjStr) {
					try {
						cachedXml = JSON.parse(cachedObjStr).data;
					} catch(e) {}
				}
				
				const normNew = newXml.replace(/\s+/g, ' ');
				const normCached = cachedXml.replace(/\s+/g, ' ');

				if (normNew !== normCached) {
					localStorage.setItem(key, JSON.stringify({
						timestamp: Date.now(),
						data: newXml
					}));

					// Update tree dynamically
					if (typeof MainTabBar !== 'undefined') {
						const actvId = MainTabBar.getActiveTab();
						if (actvId) {
							const Layout = MainTabBar.cells(actvId).getAttachedObject();
							if (Layout) {
								const Tree = Layout.cells("a").getAttachedObject();
								if (Tree && Tree._idpull[id] && Tree.getOpenState(id) === 1) {
									const selectedId = Tree.getSelectedItemId();
									Tree.deleteChildItems(id);
									Tree.loadXMLString(newXml);
									if (selectedId && Tree._idpull[selectedId]) {
										Tree.selectItem(selectedId, false);
									}
								}
							}
						}
					}
				}
			})
			.catch(err => console.error("delProp: revalidation error:", err));
	}
})();

document.addEventListener("delPropTrigger", (e) => {
	const { action, query } = e.detail;
	if (action === "smartSearch") {
		window.searchAndExpandTree(query || "", false);
	} else if (action === "smartSearchEnter") {
		window.searchAndExpandTree(query || "", true);
	} else if (action === "clearTreeCache") {
		for (let i = localStorage.length - 1; i >= 0; i--) {
			const key = localStorage.key(i);
			if (key && key.startsWith('delprop_tree_cache_')) {
				localStorage.removeItem(key);
			}
		}
	} else if (action === "getAutocompleteSuggestions") {
		if (typeof MainTabBar === 'undefined') return;
		const actvId = MainTabBar.getActiveTab();
		if (!actvId) return;
		const Layout = MainTabBar.cells(actvId).getAttachedObject();
		if (!Layout) return;
		const Tree = Layout.cells("a").getAttachedObject();
		if (!Tree) return;

		const normalizedQuery = (query || "").replace(/,/g, '.').trim();
		const parts = normalizedQuery.split('.');
		const suggestions = [];
		const MAX_SUGGESTIONS = 15;

		if (parts.length <= 1) {
			// Suggest projects
			const projectCode = parts[0] || '';
			const projectIds = Tree.getSubItems("0").split(",").filter(Boolean);
			const q = projectCode.toLowerCase();
			for (const pid of projectIds) {
				const txt = Tree.getItemText(pid).trim();
				if (!q || txt.toLowerCase().includes(q)) {
					// Try to get project title from the tree node
					const nodeObj = Tree._idpull[pid];
					let title = '';
					if (nodeObj && nodeObj.htmlNode) {
						const tr = nodeObj.htmlNode.querySelector('tr[title]');
						if (tr) title = tr.getAttribute('title') || '';
					}
					suggestions.push({ text: txt, fullPath: txt, title: title });
					if (suggestions.length >= MAX_SUGGESTIONS) break;
				}
			}
		} else if (parts.length === 2) {
			// Suggest groups within a project
			const projectCode = parts[0];
			const groupCode = parts[1] || '';
			const projectIds = Tree.getSubItems("0").split(",").filter(Boolean);
			let activeProjectId = null;
			for (const pid of projectIds) {
				const txt = Tree.getItemText(pid).trim().toLowerCase();
				if (txt === projectCode.toLowerCase()) { activeProjectId = pid; break; }
			}
			if (!activeProjectId) {
				for (const pid of projectIds) {
					const txt = Tree.getItemText(pid).trim().toLowerCase();
					if (txt.startsWith(projectCode.toLowerCase())) { activeProjectId = pid; break; }
				}
			}

			if (activeProjectId) {
				const subItems = Tree.getSubItems(activeProjectId);
				if (subItems && subItems.split(",").filter(Boolean).length > 0) {
					const groupIds = subItems.split(",").filter(Boolean);
					const gq = groupCode.toLowerCase();
					for (const gid of groupIds) {
						const txt = Tree.getItemText(gid).trim();
						if (!gq || txt.toLowerCase().includes(gq)) {
							suggestions.push({
								text: txt,
								fullPath: projectCode + '.' + txt
							});
							if (suggestions.length >= MAX_SUGGESTIONS) break;
						}
					}
				} else {
					suggestions.push({
						text: 'HINT_EXPAND_PROJECT',
						hint: true
					});
				}
			}
		} else if (parts.length >= 3) {
			// Suggest drawings within a group
			const projectCode = parts[0];
			const groupCode = parts[1];
			const drawingCode = parts[2] || '';
			const projectIds = Tree.getSubItems("0").split(",").filter(Boolean);
			let activeProjectId = null;
			for (const pid of projectIds) {
				if (Tree.getItemText(pid).trim().toLowerCase() === projectCode.toLowerCase()) { activeProjectId = pid; break; }
			}
			if (activeProjectId) {
				const groupIds = (Tree.getSubItems(activeProjectId) || '').split(",").filter(Boolean);
				let activeGroupId = null;
				for (const gid of groupIds) {
					if (Tree.getItemText(gid).trim().toLowerCase() === groupCode.toLowerCase()) { activeGroupId = gid; break; }
				}
				if (!activeGroupId) {
					for (const gid of groupIds) {
						if (Tree.getItemText(gid).trim().toLowerCase().startsWith(groupCode.toLowerCase())) { activeGroupId = gid; break; }
					}
				}
				if (activeGroupId) {
					const drawingItems = Tree.getSubItems(activeGroupId);
					if (drawingItems && drawingItems.split(",").filter(Boolean).length > 0) {
						const drawingIds = drawingItems.split(",").filter(Boolean);
						const dq = drawingCode.toLowerCase();
						for (const did of drawingIds) {
							const txt = Tree.getItemText(did).trim();
							if (!dq || txt.toLowerCase().includes(dq)) {
								suggestions.push({
									text: txt,
									fullPath: projectCode + '.' + groupCode + '.' + txt
								});
								if (suggestions.length >= MAX_SUGGESTIONS) break;
							}
						}
					} else {
						suggestions.push({
							text: 'HINT_EXPAND_GROUP',
							hint: true
						});
					}
				}
			}
		}

		document.dispatchEvent(new CustomEvent("delPropResponse", {
			detail: { action: "autocompleteSuggestions", suggestions: suggestions }
		}));
	} else if (typeof MainTabBar === 'undefined' || typeof GetTabIndexByTabID === 'undefined') {
		return;
	} else {
		const actvId = MainTabBar.getActiveTab();
		if (!actvId) return;
		const main_tab_id = GetTabIndexByTabID(actvId);
		
		if (action === "copyLinkChat" && typeof CopyLinkToBufferChat === 'function') {
			CopyLinkToBufferChat(parseInt(main_tab_id));
		} else if (action === "copyLinkEmail" && typeof CopyLinkToBufferEmail === 'function') {
			CopyLinkToBufferEmail(parseInt(main_tab_id));
		} else if (action === "copyLinkDirect" && typeof CopyLinkToBuffer === 'function') {
			CopyLinkToBuffer(parseInt(main_tab_id));
		} else if (action === "copyMD5" && typeof CopyMD5toBuffer === 'function') {
			CopyMD5toBuffer();
		} else if (action === "downloadZip" && typeof DownloadZip === 'function' && typeof GetCurrentDocID === 'function' && typeof GetCurrentDocName === 'function') {
			const doc_id = GetCurrentDocID();
			const doc_name = GetCurrentDocName();
			DownloadZip(doc_name, doc_id);
		}
	}
});

document.addEventListener("delPropRequest", (e) => {
	const { action } = e.detail;
	if (action === "getActiveDoc") {
		const tryGet = () => {
			try {
				if (typeof GetCurrentDocID !== 'function' || typeof GetCurrentDocName !== 'function') return '';
				const doc_id = GetCurrentDocID();
				const doc_name = GetCurrentDocName();
				
				const actvTab = document.querySelector('.dhxtabbar_tab.dhxtabbar_tab_actv');
				let tabName = '';
				if (actvTab) {
					const child = actvTab.childNodes[0];
					tabName = (child ? (child.innerText || child.textContent) : (actvTab.innerText || actvTab.textContent)) || '';
					tabName = tabName.trim();
				}
				
				document.dispatchEvent(new CustomEvent("delPropResponse", {
					detail: { action: "activeDoc", doc_id, doc_name, tabName }
				}));
				return doc_id;
			} catch (err) {
				console.error("delProp error in page context:", err);
			}
			return '';
		};

		// Try immediately
		const id = tryGet();
		if (!id) {
			// Retry after 100ms and 300ms if not ready yet
			setTimeout(tryGet, 100);
			setTimeout(tryGet, 300);
		}
	} else if (action === "findTabByName") {
		// Find a MainTabBar tab id by its visible display name
		try {
			if (typeof MainTabBar === 'undefined') {
				document.dispatchEvent(new CustomEvent("delPropResponse", {
					detail: { action: "findTabResult", tabId: null, requestId: e.detail.requestId }
				}));
				return;
			}
			const allTabIds = MainTabBar.getAllTabs();
			const targetName = (e.detail.tabName || '').trim();
			let foundId = null;
			for (const tabId of allTabIds) {
				// Each tab DOM element contains a .dhxtabbar_tab_text with the label
				// Find by matching tab id order: MainTabBar.t[tabId].tab holds the DOM node
				const tabObj = MainTabBar.t && MainTabBar.t[tabId] && MainTabBar.t[tabId].tab;
				if (tabObj) {
					const textEl = tabObj.querySelector('.dhxtabbar_tab_text');
					const tabText = textEl ? (textEl.innerText || textEl.textContent || '').trim() : (tabObj.innerText || '').trim();
					if (tabText === targetName) {
						foundId = tabId;
						break;
					}
				}
			}
			document.dispatchEvent(new CustomEvent("delPropResponse", {
				detail: { action: "findTabResult", tabId: foundId, requestId: e.detail.requestId }
			}));
		} catch (err) {
			console.error('delProp: findTabByName error', err);
			document.dispatchEvent(new CustomEvent("delPropResponse", {
				detail: { action: "findTabResult", tabId: null, requestId: e.detail.requestId }
			}));
		}
	} else if (action === "switchToTab") {
		// Activate the given tab id in MainTabBar
		try {
			if (typeof MainTabBar !== 'undefined' && e.detail.tabId) {
				const tabId = e.detail.tabId;
				if (MainTabBar.t && MainTabBar.t[tabId]) {
					// Use the internal API the page itself relies on
					if (typeof MainTabBar._setTabActive === 'function') {
						MainTabBar._setTabActive(tabId, true);
					} else if (MainTabBar.tabs && typeof MainTabBar.tabs(tabId).setActive === 'function') {
						MainTabBar.tabs(tabId).setActive();
					}
					// Reset filter state on the newly activated tab so nothing lingers from the previous tab
					document.dispatchEvent(new CustomEvent("delPropResponse", {
						detail: { action: "tabSwitched", tabId }
					}));
				}
			}
		} catch (err) {
			console.error('delProp: switchToTab error', err);
		}
	}
});

// Helper functions for DHTMLX Tree manipulation
function setNodeVisible(Tree, nodeId, visible) {
	const nodeObj = Tree._idpull[nodeId];
	if (!nodeObj) return;

	if (nodeObj.htmlNode) {
		nodeObj.htmlNode.style.display = visible ? '' : 'none';
		const sibling = nodeObj.htmlNode.nextSibling;
		if (sibling && sibling.tagName === 'TR') {
			sibling.style.display = visible ? '' : 'none';
		}
	}
}

function resetTreeVisibility(Tree) {
	const idpull = Tree._idpull;
	for (const id in idpull) {
		const nodeObj = idpull[id];
		if (nodeObj && nodeObj.htmlNode) {
			nodeObj.htmlNode.style.display = '';
			const sibling = nodeObj.htmlNode.nextSibling;
			if (sibling && sibling.tagName === 'TR') {
				sibling.style.display = '';
			}
		}
	}
}

function filterProjectsVisibility(Tree, projectPrefix) {
	const projectIds = Tree.getSubItems("0").split(",").filter(Boolean);
	const query = projectPrefix.toLowerCase().trim();
	for (const pid of projectIds) {
		const txt = Tree.getItemText(pid).trim().toLowerCase();
		const isMatch = !query || txt.includes(query);
		setNodeVisible(Tree, pid, isMatch);
	}
}

function filterGroupsVisibility(Tree, activeProjectId, groupPrefix) {
	const groupIds = Tree.getSubItems(activeProjectId).split(",").filter(Boolean);
	const query = groupPrefix.toLowerCase().trim();
	for (const gid of groupIds) {
		const txt = Tree.getItemText(gid).trim().toLowerCase();
		const isMatch = !query || txt.includes(query);
		setNodeVisible(Tree, gid, isMatch);
	}
}

function filterDrawingsVisibility(Tree, activeGroupId, drawingPrefix) {
	const drawingIds = Tree.getSubItems(activeGroupId).split(",").filter(Boolean);
	const query = drawingPrefix.toLowerCase().trim();
	for (const did of drawingIds) {
		const txt = Tree.getItemText(did).trim().toLowerCase();
		const parts = txt.split('.');
		const lastPart = parts[parts.length - 1] || '';
		const isMatch = !query || txt.includes(query) || lastPart.startsWith(query);
		setNodeVisible(Tree, did, isMatch);
	}
}

function waitForChildrenLoad(Tree, nodeId, callback) {
	let attempts = 0;
	const interval = setInterval(() => {
		const subItems = Tree.getSubItems(nodeId);
		attempts++;
		if ((subItems && subItems.split(",").filter(Boolean).length > 0) || attempts > 60) {
			clearInterval(interval);
			callback();
		}
	}, 100);
}

function dispatchBlockInput(blocked) {
	document.dispatchEvent(new CustomEvent("delPropResponse", { detail: { action: "blockSearchInput", blocked } }));
}

function dispatchClearInput() {
	document.dispatchEvent(new CustomEvent("delPropResponse", { detail: { action: "clearSearchInput" } }));
}

window.searchAndExpandTree = function(query, triggerEnter = false) {
	if (typeof MainTabBar === 'undefined') return;
	const actvId = MainTabBar.getActiveTab();
	if (!actvId) return;
	const Layout = MainTabBar.cells(actvId).getAttachedObject();
	if (!Layout) return;
	const Tree = Layout.cells("a").getAttachedObject();
	if (!Tree) return;

	// Normalize query by replacing commas with dots
	const normalizedQuery = (query || "").replace(/,/g, '.');
	const trimmed = normalizedQuery.trim();
	if (!trimmed) {
		resetTreeVisibility(Tree);
		return;
	}

	// Parse query parts
	const parts = trimmed.split('.');
	const partCount = parts.length;

	const projectCode = parts[0] ? parts[0].trim() : '';
	const groupCode = parts[1] ? parts[1].trim() : '';
	const drawingCode = parts[2] ? parts[2].trim() : '';

	// 1. Filter project nodes based on query prefix
	filterProjectsVisibility(Tree, projectCode);

	// Find the matching project node we need to expand/traverse (exact, then startsWith, then includes)
	const projectIds = Tree.getSubItems("0").split(",").filter(Boolean);
	let activeProjectId = null;

	for (const pid of projectIds) {
		const txt = Tree.getItemText(pid).trim().toLowerCase();
		if (txt === projectCode.toLowerCase()) {
			activeProjectId = pid;
			break;
		}
	}
	if (!activeProjectId) {
		for (const pid of projectIds) {
			const txt = Tree.getItemText(pid).trim().toLowerCase();
			if (txt.startsWith(projectCode.toLowerCase())) {
				activeProjectId = pid;
				break;
			}
		}
	}
	if (!activeProjectId) {
		for (const pid of projectIds) {
			const txt = Tree.getItemText(pid).trim().toLowerCase();
			if (txt.includes(projectCode.toLowerCase())) {
				activeProjectId = pid;
				break;
			}
		}
	}

	if (partCount < 2) {
		return;
	}

	if (!activeProjectId) {
		return;
	}

	// 2. Filter groups if we typed project.group
	// If project is collapsed, expand it!
	if (Tree.getOpenState(activeProjectId) !== 1) {
		Tree.openItem(activeProjectId);
		dispatchBlockInput(true);
		
		waitForChildrenLoad(Tree, activeProjectId, () => {
			dispatchBlockInput(false);
			window.searchAndExpandTree(query, triggerEnter);
		});
		return;
	}

	// Project is expanded! Filter groups
	filterGroupsVisibility(Tree, activeProjectId, groupCode);

	const groupIds = Tree.getSubItems(activeProjectId).split(",").filter(Boolean);
	let activeGroupId = null;

	for (const gid of groupIds) {
		const txt = Tree.getItemText(gid).trim().toLowerCase();
		if (txt === groupCode.toLowerCase()) {
			activeGroupId = gid;
			break;
		}
	}
	if (!activeGroupId) {
		for (const gid of groupIds) {
			const txt = Tree.getItemText(gid).trim().toLowerCase();
			if (txt.startsWith(groupCode.toLowerCase())) {
				activeGroupId = gid;
				break;
			}
		}
	}
	if (!activeGroupId) {
		for (const gid of groupIds) {
			const txt = Tree.getItemText(gid).trim().toLowerCase();
			if (txt.includes(groupCode.toLowerCase())) {
				activeGroupId = gid;
				break;
			}
		}
	}

	// 3. Filter drawings if we typed project.group.drawing
	if (partCount >= 3 && activeGroupId) {
		// If group is collapsed, expand it!
		if (Tree.getOpenState(activeGroupId) !== 1) {
			Tree.openItem(activeGroupId);
			dispatchBlockInput(true);
			
			waitForChildrenLoad(Tree, activeGroupId, () => {
				dispatchBlockInput(false);
				window.searchAndExpandTree(query, triggerEnter);
			});
			return;
		}

		// Group is expanded! Filter drawings
		filterDrawingsVisibility(Tree, activeGroupId, drawingCode);

		// 4. If user hit Enter, attempt to select and open matching drawing
		if (triggerEnter) {
			const drawingIds = Tree.getSubItems(activeGroupId).split(",").filter(Boolean);
			let matchedDrawingId = null;

			for (const did of drawingIds) {
				const txt = Tree.getItemText(did).trim().toLowerCase();
				const drawingParts = txt.split('.');
				const lastPart = drawingParts[drawingParts.length - 1] || '';

				if (txt === drawingCode.toLowerCase() || lastPart === drawingCode.toLowerCase() || txt === trimmed.toLowerCase()) {
					matchedDrawingId = did;
					break;
				}
			}

			if (matchedDrawingId) {
				// Select drawing and trigger double click or select event
				Tree.selectItem(matchedDrawingId, true);
				
				// Clear input
				dispatchClearInput();
			}
		}
	}
};
