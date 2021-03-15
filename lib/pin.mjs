function getViewportRect () {
	return {
		left: 0,
		right: window.innerWidth || document.documentElement.clientWidth,
		top: 0,
		bottom: window.innerHeight || document.documentElement.clientHeight,
		width: window.innerWidth || document.documentElement.clientWidth,
		height: window.innerHeight || document.documentElement.clientHeight,
	};
}

function rectToOffsetParent (r, rect) {
	return Object.assign(r, {
		left: r.left - rect.left,
		right: rect.right - r.right,
		top: r.top - rect.top,
		bottom: rect.bottom - r.bottom,
		width: r.width,
		height: r.height,
	});
}

function intersect (rect1, rect2) {
	return !(
		rect1.right < rect2.left ||
		rect1.left > rect2.right ||
		rect1.bottom < rect2.top ||
		rect1.top > rect2.bottom
	);
}

function intersectionRect (rect1, rect2) {
	return intersect(rect1, rect2) && {
		left: Math.max(rect1.left, rect2.left),
		top: Math.max(rect1.top, rect2.top),
		right: Math.min(rect1.right, rect2.right),
		bottom: Math.min(rect1.bottom, rect2.bottom),
	};
}

function wrapNode (el) {
	const parent = document.createElement("div");
	el.after(parent);
	parent.appendChild(el);
	return parent;
}

function unwrapNode (parent) {
	const childNodes = [...parent.childNodes];
	childNodes.reduce((prev, child) => (prev.after(child), child), parent);
	parent.remove();
	return childNodes;
}

function sameRect (a, b) {
	return ["top", "bottom", "left", "right"].every(key => a[key] === b[key]);
}

function sameSize (a, b) {
	return ["width", "height"].every(key => a[key] === b[key]);
}

function relPos (value, parentVal) {
	if (typeof value === "string") {
		if (value.endsWith("%")) {
			value = +(value.replace("%", "")) / 100 * parentVal;
		}
		else {
			value = +(value.replace("px", ""));
		}
	}
	return value;
}

function toOffset (val) {
	val = val || {};
	let result = {top: 0, right: 0, bottom: 0, left: 0};
	if (typeof val === "number") {
		result.top = val;
		result.right = val;
		result.bottom = val;
		result.left = val;
	}
	else if (typeof val === "string" || Array.isArray(val)) {
		const d = typeof val === "string" ? val.split(" ") : val;
		if (d.length === 1) {
			result.top = d[0];
			result.bottom = d[0];
			result.left = d[0];
			result.right = d[0];
		}
		else if (d.length === 2) {
			result.top = d[0];
			result.bottom = d[0];
			result.left = d[1];
			result.right = d[1];
		}
		else if (d.length === 3) {
			result.top = d[0];
			result.left = d[2];
			result.right = d[2];
			result.bottom = d[3];
		}
		else {
			result.top = d[0];
			result.right = d[1];
			result.bottom = d[2];
			result.left = d[3];
		}
	}
	else if (typeof val === "object") {
		result = Object.assign(result, val);
	}
	return result;
}

export default class Pin {
	constructor (pinnedEl, targetEl, options) {

		this.options = Object.assign({}, options);

		this.positions = (options.positions || options.pos || []).map(position => {
			position.viewportOffset = toOffset(position.viewportOffset ?? this.options.viewportOffset);
			return position;
		});

		this.pinnedEl = typeof pinnedEl === "string" ? document.querySelector(pinnedEl) : pinnedEl;
		this.initialParent = this.pinnedEl.parentNode;
		this.offsetParent = typeof options.offsetParent === "string" ? document.querySelector(options.offsetParent) : options.offsetParent;

		if (options.position === "detach") {
			this.replacerEl = wrapNode(this.pinnedEl);
			document.body.append(this.pinnedEl);
		}
		this.wrapperEl = wrapNode(this.pinnedEl);
		if (this.options.wrapperClass) {
			this.wrapperEl.classList.add(this.options.wrapperClass);
		}

		this.targetEl = typeof targetEl === "string" ? document.querySelector(targetEl) : targetEl;
		this.lastTargetRect = {};
		this.lastPinnedSize = {};

		Object.assign(this.wrapperEl.style, {
			position: options.position === "relative" ? "absolute" : "fixed",
			zIndex: this.options.zIndex ?? 999999,
			display: "inline-flex",
			flexDirection: "column",
			minHeight: "0px",
			flex: 1,
		});
		// this.initial = {
		// 	maxHeight: this.pinnedEl.style.maxHeight,
		// 	maxWidth: this.pinnedEl.style.maxWidth,
		// };

		Pin.items.add(this);
		if (!Pin.active) {
			Pin.start();
		}
	}
	recalc (viewportRect, viewportChanged) {
		if (!this?.wrapperEl?.parentNode) {
			this.lastTargetRect = {};
			this.lastPinnedSize = {};
			console.log("reset size");
			return;
		}

		const targetRect = this.targetEl.getBoundingClientRect();
		const targetRectChanged = !sameRect(this.lastTargetRect, targetRect);

		let pinnedSize = {
			width: this.pinnedEl.offsetWidth,
			height: this.pinnedEl.offsetHeight,
		};
		let pinnedArea = pinnedSize.width * pinnedSize.height;
		const pinnedSizeChanged = !sameSize(this.lastPinnedSize, pinnedSize);
		const offsetParent = this.offsetParent || this.wrapperEl.offsetParent;

		if (viewportChanged || targetRectChanged || pinnedSizeChanged || offsetParent !== this.lastOffsetParent) {

			if (this.wrapperEl) {
				Object.assign(this.wrapperEl.style, {"max-height": ""});
				// console.log("wrp", this.wrapperEl.getAttribute("style"));
			}

			const calculations = [];
			let fitCalc;
			if (typeof this.options.onRecalc === "function") {
				this.options.onRecalc(this);
			}
			pinnedSize = {
				width: this.pinnedEl.offsetWidth,
				height: this.pinnedEl.offsetHeight,
			};
			pinnedArea = pinnedSize.width * pinnedSize.height;

			const opRect = offsetParent
				? offsetParent.getBoundingClientRect()
				: viewportRect;


			this.positions.some((position) => {
				let {targetY = 0, targetX = 0, pinnedY = 0, pinnedX = 0, offsetX = 0, offsetY = 0} = position;

				if (typeof position.pinned === "object") {
					if (Array.isArray(position.pinned)) {
						pinnedX = position.pinned[0] ?? 0;
						pinnedY = position.pinned[1] ?? 0;
					}
					else {
						pinnedX = position.pinned.x ?? 0;
						pinnedY = position.pinned.y ?? 0;
					}
				}
				if (typeof position.target === "object") {
					if (Array.isArray(position.target)) {
						targetX = position.target[0] ?? 0;
						targetY = position.target[1] ?? 0;
					}
					else {
						targetX = position.target.x ?? 0;
						targetY = position.target.y ?? 0;
					}
				}
				if (typeof position.offset === "object") {
					if (Array.isArray(position.offset)) {
						offsetX = position.offset[0] ?? 0;
						offsetY = position.offset[1] ?? 0;
					}
					else {
						offsetX = position.offset.x ?? 0;
						offsetY = position.offset.y ?? 0;
					}
				}

				const $targetX = relPos(targetX, targetRect.width);
				const $targetY = relPos(targetY, targetRect.height);

				const targetPoint = {
					x: targetRect.left + $targetX,
					y: targetRect.top + $targetY,
				};
				const pinnedPoint = {
					x: relPos(pinnedX, pinnedSize.width),
					y: relPos(pinnedY, pinnedSize.height),
				};

				let fit = true;

				const rect = {
					$targetX,
					$targetY,
					left: targetPoint.x - pinnedPoint.x + relPos(offsetX, pinnedSize.width),
					top: targetPoint.y - pinnedPoint.y + relPos(offsetY, pinnedSize.height),
					width: pinnedSize.width,
					height: pinnedSize.height,
					$position: position,
				};

				rect.right = rect.left + pinnedSize.width;
				rect.bottom = rect.top + pinnedSize.height;

				const computedViewportRect = {
					top: viewportRect.top + relPos(position.viewportOffset.top, viewportRect.height),
					right: viewportRect.right - relPos(position.viewportOffset.right, viewportRect.width),
					bottom: viewportRect.bottom - relPos(position.viewportOffset.bottom, viewportRect.height),
					left: viewportRect.left + relPos(position.viewportOffset.left, viewportRect.width),
				};

				rect.$computedViewportRect = computedViewportRect;

				const intersectRect = intersectionRect(rect, computedViewportRect);
				let intersectArea = 0;
				if (intersectRect) {
					intersectArea = (intersectRect.right - intersectRect.left) * (intersectRect.bottom - intersectRect.top);
				}
				rect.$intersect = intersectArea / pinnedArea;
				if (rect.$intersect < 1) {
					fit = false;
				}

				calculations.push(rect);
				if (fit) {
					fitCalc = rect;
				}
				console.log(JSON.stringify(rect));
				return fit;
			});

			fitCalc = fitCalc || calculations.sort((a, b) => b.$intersect - a.$intersect)[0];

			if (fitCalc.$intersect <= 0 && this.lastPosition) {
				fitCalc = calculations.find(calc => calc.$position === this.lastPosition);
			}

			if (fitCalc) {
				const style = {
					top: "",
					bottom: "",
					left: "",
					right: "",
					width: "",
					height: "",
				};

				const viewportOffserHeight = Math.round(fitCalc.$computedViewportRect.bottom - fitCalc.$computedViewportRect.top);

				fitCalc = rectToOffsetParent(fitCalc, opRect);

				// console.log("fitCalc", fitCalc);

				const setRect = {};
				if (fitCalc.$targetY > targetRect.height / 2) {
					setRect.top = Math.floor(fitCalc.top);
					style.top = `${setRect.top}px`;

					if (fitCalc.$position.shrinkHeight) {
						style.maxHeight = `${viewportOffserHeight - setRect.top}px`;
					}
					else {
						style.maxHeight = "";
					}
				}
				else {
					setRect.bottom = Math.floor(fitCalc.bottom);
					style.bottom = `${setRect.bottom}px`;

					if (fitCalc.$position.shrinkHeight) {
						style.maxHeight = `${viewportOffserHeight - setRect.bottom}px`;
					}
					else {
						style.maxHeight = "";
					}
				}

				if (fitCalc.$targetX > targetRect.width / 2) {
					setRect.right = Math.floor(fitCalc.right);
					style.right = `${setRect.right}px`;
				}
				else {
					setRect.left = Math.floor(fitCalc.left);
					style.left = `${setRect.left}px`;
				}

				if (fitCalc.$position.sameWidth) {
					this.wrapperEl.style.minWidth = `${this.targetEl.offsetWidth}px`;
				}




				if (typeof this.options.onApply === "function") {
					this.options.onApply(this, fitCalc, style);
				}

				Object.assign(this.wrapperEl.style, style);

				if (this.options.position !== "detach") {
					let some = false;
					const wrRect = this.wrapperEl.getBoundingClientRect();
					["top", "left", "bottom", "right"]
						.forEach((key, idx) => {
							if (setRect[key] != null) {
								/*
									correct actual position shift
									for cases when transfrom applied (or other scenario, read more about stacking context: https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Positioning/Understanding_z_index/The_stacking_context)
									and makes positioning relative to transformed ancestor node
									but offsetParent does not correspond to ancestor node
								*/
								const fact = (idx > 1 ? -1 : 1) * (wrRect[key] - opRect[key]);
								let v = setRect[key];
								// console.log(key, "fact=", fact, "setRect[key]=", setRect[key], "v=", v, "wrRect[key]=", wrRect[key], "opRect[key]=", opRect[key]);
								if (fact !== v) {
									v = (v - (fact - v));
									style[key] = `${v}px`;
									some = true;
								}
							}
						});

					if (some) {
						Object.assign(this.wrapperEl.style, style);
					}
				}


				pinnedSize = {
					width: this.wrapperEl.offsetWidth,
					height: this.wrapperEl.offsetHeight,
				};
				this.lastTargetRect = targetRect;
				this.lastPinnedSize = pinnedSize;
				this.lastPosition = fitCalc.$position;
				this.lastOffsetParent = offsetParent;
			}
		}
	}
	remove () {
		this.lastTargetRect = {};
		this.lastPinnedSize = {};
		this.lastPosition = null;
		this.lastOffsetParent = null;
		unwrapNode(this.wrapperEl);
		if (this.options.position === "detach") {
			this.replacerEl.append(this.pinnedEl);
			unwrapNode(this.replacerEl);
		}
		Pin.items.delete(this);
	}
	static items = new Set();
	static start () {
		this.active = true;
		let lastViewportRect = {};
		const recalc = () => {
			if (this.active) {
				if (this.items.size) {
					const viewportRect = getViewportRect();
					const viewportChanged = !sameRect(viewportRect, lastViewportRect);
					lastViewportRect = viewportRect;
					this.items.forEach(item => item.recalc(viewportRect, viewportChanged));
				}
				requestAnimationFrame(recalc);
			}
		};
		recalc();
	}
	static stop () {
		this.active = false;
	}
}
