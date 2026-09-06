// delProp Core Module
window.delProp = window.delProp || {};

// Shared settings and user variables
window.delProp.settings = null;
window.delProp.user = null;
window.delProp.user_input = null;

// Registries of mutation handlers
const nodeHandlers = [];
const recordHandlers = [];

// Shared helper methods
window.delProp.helpers = {
	timeNorm(time) {
		return window.delProp.timeHelpers.timeNorm(time);
	},
	parseTimeToMinutes(timeStr) {
		return window.delProp.timeHelpers.parseTimeToMinutes(timeStr);
	},
	formatLateness(min) {
		return window.delProp.timeHelpers.formatMinutes(min);
	},
	formatMinutes(totalMin) {
		return window.delProp.timeHelpers.formatMinutes(totalMin);
	},
	getPerDay(start, end) {
		return window.delProp.timeHelpers.getPerDay(start, end);
	},
	calculateEndWorkTime(startStr, endStr, endFStr, userInput, dayOfWeek) {
		return window.delProp.timeHelpers.calculateEndWorkTime(startStr, endStr, endFStr, userInput, dayOfWeek);
	},
	getWorkDayBounds(startStr, endStr, endFStr, userInput, dayOfWeek) {
		return window.delProp.timeHelpers.getWorkDayBounds(startStr, endStr, endFStr, userInput, dayOfWeek);
	},
	getOvertimeStatus(nowMs, endWorkMs, maxOvertimeStr) {
		return window.delProp.timeHelpers.getOvertimeStatus(nowMs, endWorkMs, maxOvertimeStr);
	}
};

// Ready state event handler registry
let coreIsReady = false;
const readyHandlers = [];

window.delProp.onCoreReady = function(callback) {
	if (typeof callback === 'function') {
		if (coreIsReady) {
			try {
				callback();
			} catch (e) {
				console.error("delProp: error executing ready callback immediately:", e);
			}
		} else {
			readyHandlers.push(callback);
		}
	}
};

/**
 * Registers a callback for DOM mutations.
 * @param {Object} handler
 * @param {string} handler.name - Diagnostic name.
 * @param {Function} [handler.check] - Check function for added nodes: (node) => boolean.
 * @param {Function} [handler.callback] - Action function for added nodes: (node) => void.
 * @param {Function} [handler.checkMutation] - Check function for raw MutationRecord: (mutation) => void.
 */
window.delProp.registerMutationHandler = function(handler) {
	if (handler.check && handler.callback) {
		nodeHandlers.push(handler);
	}
	if (handler.checkMutation) {
		recordHandlers.push(handler);
	}
};

// Initialize single MutationObserver
const globalObserver = new MutationObserver(mutations => {
	const nodeHandlersCount = nodeHandlers.length;
	const recordHandlersCount = recordHandlers.length;
	const mutationsCount = mutations.length;

	for (let i = 0; i < mutationsCount; i++) {
		const mutation = mutations[i];

		if (nodeHandlersCount > 0 && mutation.addedNodes && mutation.addedNodes.length > 0) {
			const addedNodes = mutation.addedNodes;
			const addedNodesCount = addedNodes.length;

			for (let j = 0; j < addedNodesCount; j++) {
				const node = addedNodes[j];

				for (let k = 0; k < nodeHandlersCount; k++) {
					const handler = nodeHandlers[k];
					try {
						if (handler.check(node)) {
							handler.callback(node);
						}
					} catch (e) {
						console.error(`delProp: handler '${handler.name}' error in callback:`, e);
					}
				}
			}
		}

		for (let j = 0; j < recordHandlersCount; j++) {
			const handler = recordHandlers[j];
			try {
				handler.checkMutation(mutation);
			} catch (e) {
				console.error(`delProp: handler '${handler.name}' error in checkMutation:`, e);
			}
		}
	}
});

// Reusable Modal Component (pan & zoom)
const modalView = (() => {
	const matrix = [1, 0, 0, 1, 0, 0];
	let m = matrix;
	let scale = 1;
	const pos = { x: 0, y: 0 };
	let dirty = true;
	
	const API = {
		applyTo(el) {
			if (dirty) { this.update(); }
			el.style.transform = `matrix(${m[0]},${m[1]},${m[2]},${m[3]},${m[4]},${m[5]})`;
		},
		update() {
			dirty = false;
			m[3] = m[0] = scale;
			m[2] = m[1] = 0;
			m[4] = pos.x;
			m[5] = pos.y;
		},
		pan(amount) {
			if (dirty) { this.update(); }
			pos.x += amount.x;
			pos.y += amount.y;
			dirty = true;
		},
		scaleAt(at, amount) {
			if (dirty) { this.update(); }
			scale *= amount;
			pos.x = at.x - (at.x - pos.x) * amount;
			pos.y = at.y - (at.y - pos.y) * amount;
			dirty = true;
		},
		close() {
			m = matrix;
			dirty = true;
			scale = 1;
			pos.x = 0;
			pos.y = 0;
		}
	};
	return API;
})();

const mouseState = { x: 0, y: 0, oldX: 0, oldY: 0, button: false };

function handleMouseEvent(event) {
	const zoomMe = document.getElementById('zoomMe');
	if (!zoomMe) return;

	if (event.type === "mousedown") { mouseState.button = true; }
	if (event.type === "mouseup" || event.type === "mouseout") { mouseState.button = false; }
	
	mouseState.oldX = mouseState.x;
	mouseState.oldY = mouseState.y;
	mouseState.x = event.pageX;
	mouseState.y = event.pageY;
	
	if (mouseState.button) {
		modalView.pan({ x: mouseState.x - mouseState.oldX, y: mouseState.y - mouseState.oldY });
		modalView.applyTo(zoomMe);
	}
	event.preventDefault();
}

function handleMouseWheelEvent(event) {
	const zoomMe = document.getElementById('zoomMe');
	if (!zoomMe) return;

	const x = event.pageX - (zoomMe.width / 2);
	const y = event.pageY - (zoomMe.height / 2);
	if (event.deltaY < 0) {
		modalView.scaleAt({ x, y }, 1.1);
	} else {
		modalView.scaleAt({ x, y }, 1 / 1.1);
	}
	modalView.applyTo(zoomMe);
	event.preventDefault();
}

window.delProp.openModal = function(src) {
	if (document.getElementById('modal')) return;

	const div = document.createElement('div');
	const img = document.createElement('img');

	div.classList.add('blured_background');
	div.id = 'modal';

	img.classList.add('zoomables');
	img.id = 'zoomMe';
	img.src = src;

	div.appendChild(img);
	document.body.appendChild(div);

	// Fit the image into 80% of the screen: stretch small images up, shrink large ones down.
	// Implemented via CSS width/height so pan & zoom (transform matrix) keep working on top.
	const fitImageToScreen = () => {
		const nw = img.naturalWidth, nh = img.naturalHeight;
		if (!nw || !nh) return;
		const maxW = window.innerWidth * 0.8;
		const maxH = window.innerHeight * 0.8;
		const scale = Math.min(maxW / nw, maxH / nh);
		if (scale > 0 && Math.abs(scale - 1) > 0.001) {
			img.style.width = `${Math.round(nw * scale)}px`;
			img.style.height = `${Math.round(nh * scale)}px`;
		}
	};
	if (img.complete && img.naturalWidth) {
		fitImageToScreen();
	} else {
		img.addEventListener('load', fitImageToScreen);
	}

	document.addEventListener('mousemove', handleMouseEvent, { passive: false });
	document.addEventListener('mousedown', handleMouseEvent, { passive: false });
	document.addEventListener('mouseup', handleMouseEvent, { passive: false });
	document.addEventListener('mouseout', handleMouseEvent, { passive: false });
	document.addEventListener('wheel', handleMouseWheelEvent, { passive: false });

	const closeHandler = (e) => {
		if (e.type === "keydown" && e.key === 'Escape' || e.type === "click" && e.target === div) {
			div.style.opacity = 0;
			setTimeout(() => div.remove(), 500);
			
			modalView.close();

			document.removeEventListener('mousemove', handleMouseEvent, { passive: false });
			document.removeEventListener('mousedown', handleMouseEvent, { passive: false });
			document.removeEventListener('mouseup', handleMouseEvent, { passive: false });
			document.removeEventListener('mouseout', handleMouseEvent, { passive: false });
			document.removeEventListener('wheel', handleMouseWheelEvent, { passive: false });
			document.removeEventListener('keydown', closeHandler);
		}
	};

	div.addEventListener('click', closeHandler);
	document.addEventListener('keydown', closeHandler);

	setTimeout(() => div.style.opacity = 1, 50);
};

// Initialize settings and start execution
chrome.storage.local.get(['formFields', 'user', 'user_input'], (data) => {
	window.delProp.settings = data?.formFields || {};
	window.delProp.user = data?.user || null;
	window.delProp.user_input = data?.user_input || null;

	console.log("delProp: core config initialized:", window.delProp.settings);

	// Start observing document body
	globalObserver.observe(document.body, { childList: true, subtree: true });

	// Trigger all registered handlers
	coreIsReady = true;
	readyHandlers.forEach(fn => {
		try {
			fn();
		} catch (e) {
			console.error("delProp: error executing ready callback:", e);
		}
	});
	readyHandlers.length = 0; // Clear the queue
});
