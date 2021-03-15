const toButtons = buttons => (buttons || 0).toString(2).split("").reverse().reduce((res, val, idx) => (val == "1" && res.push(idx + 1), res), []);

function toPointers (event) {
	const pointers = [];
	if (event.type.startsWith("touch")) {
		[...event.changedTouches].forEach(touch => {
			pointers.push({
				id: touch.identifier,
				type: "touch",
				pointerType: "touch",
				pressure: touch.force == null ? 0.5 : touch.force,
				width: touch.radiusX == null ? 1 : touch.radiusX * 2,
				height: touch.radiusY == null ? 1 : touch.radiusY * 2,
				twist: touch.rotationAngle == null ? 0 : touch.rotationAngle,
				pageX: touch.pageX,
				pageY: touch.pageY,
				screenX: touch.screenX,
				screenY: touch.screenY,
				clientX: touch.clientX,
				clientY: touch.clientY,
				buttons: toButtons(event.buttons),
			});
		});
	}
	else if (event.type.startsWith("pointer")) {
		pointers.push({
			id: event.pointerId,
			type: "pointer",
			pointerType: event.pointerType,
			isPrimary: event.isPrimary,
			pressure: event.pressure,
			width: event.width,
			height: event.height,
			twist: event.twist,
			tiltX: event.tiltX,
			tiltY: event.tiltY,
			pageX: event.pageX,
			pageY: event.pageY,
			screenX: event.screenX,
			screenY: event.screenY,
			clientX: event.clientX,
			clientY: event.clientY,
			buttons: toButtons(event.buttons),
		});
	}
	else if (event.type.startsWith("mouse")) {
		pointers.push({
			id: 0,
			type: "mouse",
			pointerType: "mouse",
			pressure: 0.5,
			width: 1,
			height: 1,
			twist: 0,
			tiltX: 0,
			tiltY: 0,
			pageX: event.pageX,
			pageY: event.pageY,
			screenX: event.screenX,
			screenY: event.screenY,
			clientX: event.clientX,
			clientY: event.clientY,
			buttons: toButtons(event.buttons),
		});
	}
	return pointers;
}


function transformItem (item, pointer) {
	item.prev = item.cur;
	item.cur = pointer;
	item.time = new Date();
	item.changed = true;
	return item;
}

export default function handleDrag (targetEl, {
	start, move, end, startGroup, endGroup, pointerEvents = true,
	buttons, pointerTypes, filter,
} = {}) {
	const el = typeof targetEl === "string" ? document.querySelector(targetEl) : (Array.isArray(targetEl) ? targetEl[0] : targetEl);
	const activePointers = new Map();
	const usePointerEvents = pointerEvents && typeof PointerEvent !== "undefined";
	let groupState;
	const onstart = event => {
		const pointers = toPointers(event);
		const prevActiveLength = activePointers.size;
		const changed = [];
		pointers.forEach(pointer => {
			if (
				(!buttons || JSON.stringify(buttons) === JSON.stringify(pointer.buttons)) &&
				(!pointerTypes || pointerTypes.includes(pointer.pointerType)) &&
				(!filter || filter(pointer, "start"))
			) {
				const id = `${pointer.type}-${pointer.id}`;
				const item = transformItem({
					id,
					pid: pointer.id,
					startTime: new Date(),
					start: pointer,
					state: {},
				}, pointer);


				changed.push(item);
				activePointers.set(id, item);
			}
		});
		try {
			if (activePointers.size) {
				if (!prevActiveLength) {
					groupState = {el};
					if (!startGroup || startGroup([...activePointers.values()], groupState) !== false) {
						if (usePointerEvents) {
							document.addEventListener("pointermove", onmove, {passive: false});
							document.addEventListener("pointerup", onend, {passive: false});
						}
						else {
							document.addEventListener("mousemove", onmove, {passive: false});
							document.addEventListener("mouseup", onend, {passive: false});
							document.addEventListener("touchmove", onmove, {passive: false});
							document.addEventListener("touchend", onend, {passive: false});
						}
					}
				}

				start && start([...activePointers.values()], groupState);
			}
		}
		finally {
			changed.forEach(item => item.changed = false);
		}
	};

	const onmove = event => {
		const changed = [];
		const pointers = toPointers(event);
		pointers.forEach(pointer => {
			const id = `${pointer.type}-${pointer.id}`;
			const item = activePointers.get(id);
			if (
				item &&
				(!buttons || JSON.stringify(buttons) === JSON.stringify(pointer.buttons)) &&
				(!filter || filter(item, "move"))
			) {
				if (!item.captured) {
					if (usePointerEvents) {
						el.setPointerCapture && el.setPointerCapture(item.pid);
					}
					item.captured = true;
				}
				if (!item.drag) {
					const deltaX = pointer.screenX - item.start.screenX;
					const deltaY = pointer.screenY - item.start.screenY;
					const delta = Math.sqrt(deltaX ** 2 + deltaY ** 2);
					if (delta > 7) {
						item.drag = true;
					}
				}
				if (item.drag) {
					changed.push(transformItem(item, pointer));
				}
			}
		});
		if (changed.length) {
			try {
				move && move([...activePointers.values()], groupState);
			}
			finally {
				changed.forEach(item => item.changed = false);
			}
		}

	};

	const unbind = () => {
		if (usePointerEvents) {
			el.removeEventListener("pointercancel", onend, {passive: false});
			el.removeEventListener("pointerdown", onstart, {passive: false});
			document.removeEventListener("pointermove", onmove, {passive: false});
			document.removeEventListener("pointerup", onend, {passive: false});
		}
		else {
			el.removeEventListener("touchstart", onstart, {passive: false});
			el.removeEventListener("mousedown", onstart, {passive: false});
			document.removeEventListener("touchmove", onmove, {passive: false});
			document.removeEventListener("mousemove", onmove, {passive: false});
			document.removeEventListener("touchend", onend, {passive: false});
			document.removeEventListener("mouseup", onend, {passive: false});
		}
	};

	const onend = event => {
		const pointers = toPointers(event);
		const changed = [];
		pointers.forEach(pointer => {
			const id = `${pointer.type}-${pointer.id}`;
			const item = activePointers.get(id);
			if (item) {
				item.changed = true;
				item.end = pointer;
				changed.push(item);
				if (item.captured) {
					el.releasePointerCapture && el.releasePointerCapture(item.pid);
				}
				activePointers.delete(id);
			}
		});
		if (changed.length) {
			//
		}
		try {
			end && end([...activePointers.values()], groupState);
		}
		finally {
			//
		}
		if (!activePointers.size) {
			try {
				endGroup && endGroup(groupState);
			}
			finally {
				groupState = null;
				if (usePointerEvents) {
					document.removeEventListener("pointermove", onmove, {passive: false});
					document.removeEventListener("pointerup", onend, {passive: false});
				}
				else {
					document.removeEventListener("mousemove", onmove, {passive: false});
					document.removeEventListener("mouseup", onend, {passive: false});
					document.removeEventListener("touchmove", onmove, {passive: false});
					document.removeEventListener("touchend", onend, {passive: false});
				}
			}
		}

	};


	if (usePointerEvents) {
		el.style["touch-action"] = "none";
		el.addEventListener("pointercancel", onend, {passive: false});
		el.addEventListener("pointerdown", onstart, {passive: false});
	}
	else {
		el.addEventListener("touchstart", onstart, {passive: false});
		el.addEventListener("mousedown", onstart, {passive: false});
	}

	return {
		unbind () {
			el.style["touch-action"] = "";
			unbind();
		},
	};
}
