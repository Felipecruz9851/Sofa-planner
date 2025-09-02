// Canvas management and module placement
class CanvasManager {
    constructor() {
        this.snapTolerance = 12;
        this.pixelsPerMM = 0.2; // Increased scale for better visibility
        this.isDragging = false;
        this.selectedModules = []; // <--- agora é array

        this.init();
    }

    // Centralized function to calculate exact dimensions from database values
    getModuleDimensions(moduleData) {
        const width = Math.round(moduleData.largura * this.pixelsPerMM);
        const height = Math.round(moduleData.profundidade * this.pixelsPerMM);
        return { width, height };
    }

    init() {
        this.setupCanvasEvents();
        this.setupDropZone();
    }

    setupCanvasEvents() {
        const canvas = document.getElementById('canvasSheet');

        // Canvas click to deselect
        canvas.addEventListener('click', (e) => {
            if (e.target === canvas) {
                this.deselectAllModules();
            }
        });

        // Prevent default drag behavior
        canvas.addEventListener('dragover', (e) => {
            e.preventDefault();
            canvas.classList.add('drag-over');
        });

        canvas.addEventListener('dragleave', (e) => {
            if (!canvas.contains(e.relatedTarget)) {
                canvas.classList.remove('drag-over');
            }
        });

        canvas.addEventListener('drop', (e) => {
            e.preventDefault();
            canvas.classList.remove('drag-over');

            try {
                const moduleData = JSON.parse(e.dataTransfer.getData('application/json'));
                const rect = canvas.getBoundingClientRect();
                const x = (e.clientX - rect.left) / sofaDesigner.zoomLevel;
                const y = (e.clientY - rect.top) / sofaDesigner.zoomLevel;

                this.createPlacedModule(moduleData, x, y);
            } catch (error) {
                console.error('Error placing module:', error);
                sofaDesigner.showToast('Erro ao colocar módulo', 'error');
            }
        });
    }

    setupDropZone() {
        // Additional drop zone setup if needed
    }

    createPlacedModule(moduleData, x, y, saveState = true, opts = {}) {
    if (saveState) {
        sofaDesigner.saveState();
    }

    const canvas = document.getElementById('canvasSheet');
    const { width, height } = this.getModuleDimensions(moduleData);

    const adjustedX = Math.max(0, Math.min(x - width / 2, canvas.clientWidth - width));
    const adjustedY = Math.max(0, Math.min(y - height / 2, canvas.clientHeight - height));

    if (this.hasCollision(null, adjustedX, adjustedY, width, height)) {
        sofaDesigner.showToast('Posição ocupada! Tente outro local.', 'warning');
        return null;
    }

    const moduleElement = document.createElement('div');
    moduleElement.className = 'placed-module fade-in';
    moduleElement.style.left = adjustedX + 'px';
    moduleElement.style.top = adjustedY + 'px';
    moduleElement.style.width = width + 'px';
    moduleElement.style.height = height + 'px';

    moduleElement.dataset.moduleId = moduleData.id;
    moduleElement.dataset.moduleData = JSON.stringify(moduleData);

    // ← aqui aceita valores vindos de fora
    moduleElement.dataset.rotation = String(opts.rotation ?? 0);
    moduleElement.dataset.flipX = String(opts.flipX ?? 1);
    moduleElement.dataset.flipY = String(opts.flipY ?? 1);

    const controls = this.createModuleControls(moduleElement);

    const img = document.createElement('img');
    img.src = moduleData.image;
    img.alt = moduleData.modulo;
    img.draggable = false;
    img.style.position = 'absolute';
    img.style.top = '50%';
    img.style.left = '50%';
    img.style.transformOrigin = 'center center';
    img.style.objectFit = 'fill';
    img.style.transform = 'translate(-50%, -50%)';

    moduleElement.appendChild(controls);
    moduleElement.appendChild(img);

    this.setupModuleInteractions(moduleElement);
    canvas.appendChild(moduleElement);

    // aplica rotação/flip na imagem
    this.applyTransforms(moduleElement);

    sofaDesigner.updateModuleCount();
    sofaDesigner.updateStatusMessage(`Módulo "${moduleData.modulo}" adicionado`);

    return moduleElement;
}

    createModuleControls(moduleElement) {
        const controls = document.createElement('div');
        controls.className = 'module-controls';

        const buttons = [
            { icon: 'fa-rotate-left', title: 'Girar para esquerda', action: () => this.rotateModule(moduleElement, -90) },
            { icon: 'fa-rotate-right', title: 'Girar para direita', action: () => this.rotateModule(moduleElement, 90) },
            { icon: 'fa-arrows-alt-h', title: 'Espelhar horizontalmente', action: () => this.flipModule(moduleElement, 'x') },
            { icon: 'fa-arrows-alt-v', title: 'Espelhar verticalmente', action: () => this.flipModule(moduleElement, 'y') },
            { icon: 'fa-copy', title: 'Duplicar', action: () => this.duplicateModule(moduleElement) },
            { icon: 'fa-trash', title: 'Remover', action: () => this.removeModule(moduleElement), class: 'danger' }
        ];

        buttons.forEach(btn => {
            const button = document.createElement('button');
            button.className = `control-btn ${btn.class || ''}`;
            button.innerHTML = `<i class="fas ${btn.icon}"></i>`;
            button.title = btn.title;
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                btn.action();
            });
            controls.appendChild(button);
        });

        return controls;
    }

    setupModuleInteractions(moduleElement) {
        let startX, startY, startLeft, startTop;
        let isDragging = false;

        // Module selection
        moduleElement.addEventListener('click', (e) => {
            e.stopPropagation();
            if (e.ctrlKey) {
                if (this.selectedModules.includes(moduleElement)) {
                    // Já estava selecionado → remove
                    this.selectedModules = this.selectedModules.filter(m => m !== moduleElement);
                    moduleElement.classList.remove("selected");
                } else {
                    // Adiciona ao grupo
                    this.selectedModules.push(moduleElement);
                    moduleElement.classList.add("selected");
                }
            } else {
                // Clique normal → limpa e seleciona só este
                this.clearSelection();
                this.selectedModules = [moduleElement];
                moduleElement.classList.add("selected");
            }

            // Depois disso você chama o handler de arraste (único ou múltiplo)
            this.startDrag(e, moduleElement);
        });




        // Mouse down for dragging
        moduleElement.addEventListener('mousedown', (e) => {
            if (this.findParentWithClass(e.target, 'control-btn')) return;

            e.preventDefault();
            this.selectModule(moduleElement);

            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            startLeft = parseInt(moduleElement.style.left) || 0;
            startTop = parseInt(moduleElement.style.top) || 0;

            moduleElement.style.cursor = 'grabbing';

            const onMouseMove = (moveEvent) => {
                if (!isDragging) return;

                const deltaX = (moveEvent.clientX - startX) / sofaDesigner.zoomLevel;
                const deltaY = (moveEvent.clientY - startY) / sofaDesigner.zoomLevel;

                let newX = startLeft + deltaX;
                let newY = startTop + deltaY;

                // Keep within canvas bounds
                const canvas = document.getElementById('canvasSheet');
                const moduleWidth = moduleElement.offsetWidth;
                const moduleHeight = moduleElement.offsetHeight;

                newX = Math.max(0, Math.min(newX, canvas.clientWidth - moduleWidth));
                newY = Math.max(0, Math.min(newY, canvas.clientHeight - moduleHeight));

                // Apply snapping
                const snapped = this.snapPosition(newX, newY, moduleWidth, moduleHeight, moduleElement);
                newX = snapped.x;
                newY = snapped.y;

                // Check for collision using exact container dimensions
                const currentWidth = parseInt(moduleElement.style.width) || moduleWidth;
                const currentHeight = parseInt(moduleElement.style.height) || moduleHeight;

                if (this.hasCollision(moduleElement, newX, newY, currentWidth, currentHeight)) {
                    moduleElement.classList.add('collision');
                } else {
                    moduleElement.classList.remove('collision');
                    moduleElement.style.left = newX + 'px';
                    moduleElement.style.top = newY + 'px';
                    sofaDesigner.updateModuleCount();
                }

                // Visual feedback for snapping
                if (snapped.snapped) {
                    moduleElement.classList.add('snapping');
                } else {
                    moduleElement.classList.remove('snapping');
                }
                sofaDesigner.updateModuleCount();
            };

            const onMouseUp = () => {
                if (isDragging) {
                    sofaDesigner.saveState();
                    
                }

                isDragging = false;
                moduleElement.style.cursor = 'move';
                moduleElement.classList.remove('collision', 'snapping');

                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
    }

    selectModule(moduleElement, append = false) {
        if (!append) {
            this.deselectAllModules();
        }
        moduleElement.classList.add('selected');
        if (!this.selectedModules.includes(moduleElement)) {
            this.selectedModules.push(moduleElement);
        }
    }

    deselectAllModules() {
        document.querySelectorAll('.placed-module.selected').forEach(module => {
            module.classList.remove('selected');
        });
        this.selectedModule = null;
    }

    rotateModule(moduleElement, degrees) {
        sofaDesigner.saveState();

        // Dados do módulo
        const moduleData = JSON.parse(moduleElement.dataset.moduleData || '{}');
        const prevAngle = Number(moduleData.angulo) || 0;

        // soma, normaliza e quantiza em múltiplos de 90°
        let angulo = prevAngle + degrees;
        angulo = ((angulo % 360) + 360) % 360;
        angulo = Math.round(angulo / 90) * 90;

        moduleData.angulo = angulo;
        moduleElement.dataset.moduleData = JSON.stringify(moduleData);

        // Dimensões base do módulo
        const { width: baseW, height: baseH } = this.getModuleDimensions(moduleData);

        // Dimensões antigas do container
        const oldW = parseInt(moduleElement.style.width) || moduleElement.offsetWidth;
        const oldH = parseInt(moduleElement.style.height) || moduleElement.offsetHeight;

        // Novo tamanho dependendo da rotação
        const isNinety = Math.abs(angulo % 180) === 90;
        const newW = isNinety ? baseH : baseW;
        const newH = isNinety ? baseW : baseH;

        // Mantém o centro fixo
        let left = parseInt(moduleElement.style.left) || 0;
        let top = parseInt(moduleElement.style.top) || 0;

        const dx = (oldW - newW) / 2;
        const dy = (oldH - newH) / 2;

        moduleElement.style.width = newW + 'px';
        moduleElement.style.height = newH + 'px';
        moduleElement.style.left = (left + dx) + 'px';
        moduleElement.style.top = (top + dy) + 'px';

        // Aplica transformações
        this.applyTransforms(moduleElement);
        moduleElement.dataset.rotation = String(angulo); // mantém colisão coerente com a rotação

        sofaDesigner.showToast(`Módulo rotacionado para ${angulo}°`, 'info');
        sofaDesigner.updateModuleCount();
        
        
    }

    flipModule(moduleElement, axis) {
        sofaDesigner.saveState();

        const currentFlipX = parseFloat(moduleElement.dataset.flipX) || 1;
        const currentFlipY = parseFloat(moduleElement.dataset.flipY) || 1;

        let newFlipX = currentFlipX;
        let newFlipY = currentFlipY;

        if (axis === 'x') {
            newFlipX = currentFlipX === 1 ? -1 : 1;
        } else if (axis === 'y') {
            newFlipY = currentFlipY === 1 ? -1 : 1;
        }

        moduleElement.dataset.flipX = newFlipX.toString();
        moduleElement.dataset.flipY = newFlipY.toString();

        // Aplica transformações
        this.applyTransforms(moduleElement);

        sofaDesigner.showToast(`Módulo espelhado ${axis === 'x' ? 'horizontalmente' : 'verticalmente'}`, 'info');
    }

    applyTransforms(moduleElement) {
        const moduleData = JSON.parse(moduleElement.dataset.moduleData || '{}');
        const angulo = Number(moduleData.angulo) || 0;
        const flipX = parseFloat(moduleElement.dataset.flipX) || 1;
        const flipY = parseFloat(moduleElement.dataset.flipY) || 1;
        const { width: refW, height: refH } = this.getModuleDimensions(moduleData);

        const img = moduleElement.querySelector('img');
        if (img) {
            img.style.position = 'absolute';
            img.style.top = '50%';
            img.style.left = '50%';
            img.style.width = refW + 'px';
            img.style.height = refH + 'px';
            img.style.objectPosition = 'center';
            img.style.transformOrigin = 'center center';
            img.style.objectFit = 'fill';
            img.style.transform = `translate(-50%, -50%) rotate(${angulo}deg) scaleX(${flipX}) scaleY(${flipY})`;
        }
        
    }

    // Mantém compatibilidade: updateModuleDimensions agora é só um alias
    updateModuleDimensions(moduleElement) {
        this.applyTransforms(moduleElement);
    }

    getActualModuleDimensions(moduleElement) {
        const width = parseInt(moduleElement.style.width) || moduleElement.offsetWidth;
        const height = parseInt(moduleElement.style.height) || moduleElement.offsetHeight;
        return { width, height };
    }

    _createPlacedModuleExact(moduleData, left, top, width, height, opts = {}) {
        const canvas = document.getElementById('canvasSheet');

        // Clamp nos limites do canvas
        left = Math.max(0, Math.min(left, canvas.clientWidth - width));
        top = Math.max(0, Math.min(top, canvas.clientHeight - height));

        const el = document.createElement('div');
        el.className = 'placed-module fade-in';
        el.style.left = left + 'px';
        el.style.top = top + 'px';
        el.style.width = width + 'px';
        el.style.height = height + 'px';

        el.dataset.moduleId = moduleData.id;
        el.dataset.moduleData = JSON.stringify(moduleData);
        el.dataset.rotation = String(opts.rotation || 0);
        el.dataset.flipX = String(opts.flipX ?? 1);
        el.dataset.flipY = String(opts.flipY ?? 1);

        const controls = this.createModuleControls(el);

        const img = document.createElement('img');
        img.src = moduleData.image;
        img.alt = moduleData.modulo;
        img.draggable = false;
        img.style.position = 'absolute';
        img.style.top = '50%';
        img.style.left = '50%';
        img.style.transformOrigin = 'center center';
        img.style.objectFit = 'fill';
        img.style.transform = 'translate(-50%, -50%)';

        el.appendChild(controls);
        el.appendChild(img);

        this.setupModuleInteractions(el);
        canvas.appendChild(el);

        // aplica rotação/flip na imagem
        this.applyTransforms(el);

        sofaDesigner.updateModuleCount();
        sofaDesigner.updateStatusMessage(`Módulo "${moduleData.modulo}" duplicado`);

        return el;
    }


    duplicateModule(moduleElement) {
        sofaDesigner.saveState();

        const moduleData = JSON.parse(moduleElement.dataset.moduleData || '{}');
        const angle = Number(moduleData.angulo) || 0;
        const flipX = parseFloat(moduleElement.dataset.flipX) || 1;
        const flipY = parseFloat(moduleElement.dataset.flipY) || 1;

        const currentLeft = parseInt(moduleElement.style.left) || 0;
        const currentTop = parseInt(moduleElement.style.top) || 0;
        const { width: currW, height: currH } = this.getActualModuleDimensions(moduleElement);

        const canvas = document.getElementById('canvasSheet');

        // Direção baseada no ângulo
        let dx = 0, dy = 0;
        const angNorm = ((angle % 360) + 360) % 360;
        if (angNorm === 0) { dx = currW; dy = 0; }       // direita
        else if (angNorm === 90) { dx = 0; dy = currH; } // baixo
        else if (angNorm === 180) { dx = -currW; dy = 0; } // esquerda
        else if (angNorm === 270) { dx = 0; dy = -currH; } // cima
        else { dx = currW; }

        // Avança em "saltos" até achar espaço livre
        let targetLeft = currentLeft + dx;
        let targetTop = currentTop + dy;

        while (this.hasCollision(null, targetLeft, targetTop, currW, currH)) {
            targetLeft += dx;
            targetTop += dy;

            // limite do canvas → aborta
            if (
                targetLeft < 0 ||
                targetTop < 0 ||
                targetLeft > canvas.clientWidth - currW ||
                targetTop > canvas.clientHeight - currH
            ) {
                sofaDesigner.showToast('Sem espaço livre para duplicar.', 'warning');
                return;
            }
        }

        this._createPlacedModuleExact(
            moduleData,
            targetLeft,
            targetTop,
            currW,
            currH,
            { rotation: angle, flipX, flipY }
        );
    }


    removeModule(moduleElement) {
        sofaDesigner.saveState();
        moduleElement.remove();
        sofaDesigner.updateModuleCount();
        sofaDesigner.showToast('Módulo removido', 'info');
    }

    hasCollision(movingElement, x, y, width, height) {
        const modules = Array.from(document.querySelectorAll('.placed-module'));

        for (const module of modules) {
            if (module === movingElement) continue;

            // Check rotation of existing module
            const rotation = parseInt(module.dataset.rotation) || 0;

            if (rotation % 360 === 0) {
                // Use simple rect collision for non-rotated objects
                const moduleRect = this.getModuleRect(module);
                const testRect = { left: x, top: y, right: x + width, bottom: y + height };

                if (this.rectsOverlap(moduleRect, testRect)) {
                    return true;
                }
            } else {
                // Use SAT for rotated objects
                const moduleRotatedBounds = this.getRotatedBounds(module);
                const testBounds = this.createBounds(x, y, width, height, 0);

                if (this.boundsOverlap(moduleRotatedBounds, testBounds)) {
                    return true;
                }
            }
        }

        return false;
    }

    snapPosition(x, y, width, height, movingElement) {
        const modules = Array.from(document.querySelectorAll('.placed-module'))
            .filter(module => module !== movingElement);

        let snappedX = x;
        let snappedY = y;
        let snapped = false;

        for (const module of modules) {
            // Use real bounds for rotated objects or simple rect for non-rotated
            const rotation = parseInt(module.dataset.rotation) || 0;
            let rect;

            if (rotation % 360 === 0) {
                // Use simple rect for non-rotated objects (faster)
                rect = this.getModuleRect(module);
            } else {
                // For rotated objects, get the bounding box of the rotated shape
                const bounds = this.getRotatedBounds(module);
                const minX = Math.min(...bounds.corners.map(c => c.x));
                const maxX = Math.max(...bounds.corners.map(c => c.x));
                const minY = Math.min(...bounds.corners.map(c => c.y));
                const maxY = Math.max(...bounds.corners.map(c => c.y));

                rect = {
                    left: minX,
                    top: minY,
                    right: maxX,
                    bottom: maxY,
                    width: maxX - minX,
                    height: maxY - minY
                };
            }

            // Snap to top edge
            if (Math.abs(y - rect.top) < this.snapTolerance) {
                snappedY = rect.top;
                snapped = true;
            }

            // Snap to bottom edge
            if (Math.abs(y + height - rect.bottom) < this.snapTolerance) {
                snappedY = rect.bottom - height;
                snapped = true;
            }

            // Snap to left edge
            if (Math.abs(x - rect.left) < this.snapTolerance) {
                snappedX = rect.left;
                snapped = true;
            }

            // Snap to right edge
            if (Math.abs(x + width - rect.right) < this.snapTolerance) {
                snappedX = rect.right - width;
                snapped = true;
            }

            // Snap to adjacent positioning
            if (Math.abs(x - rect.right) < this.snapTolerance) {
                snappedX = rect.right;
                snapped = true;
            }

            if (Math.abs(x + width - rect.left) < this.snapTolerance) {
                snappedX = rect.left - width;
                snapped = true;
            }
        }

        return { x: snappedX, y: snappedY, snapped };
    }

    getModuleRect(moduleElement) {
        const left = parseInt(moduleElement.style.left) || 0;
        const top = parseInt(moduleElement.style.top) || 0;
        const dimensions = this.getActualModuleDimensions(moduleElement);

        return {
            left,
            top,
            right: left + dimensions.width,
            bottom: top + dimensions.height,
            width: dimensions.width,
            height: dimensions.height
        };
    }

    getRotatedBounds(moduleElement) {
        const left = parseInt(moduleElement.style.left) || 0;
        const top = parseInt(moduleElement.style.top) || 0;
        const dimensions = this.getActualModuleDimensions(moduleElement);
        const rotation = parseInt(moduleElement.dataset.rotation) || 0;

        return this.createBounds(left, top, dimensions.width, dimensions.height, rotation);
    }

    createBounds(x, y, width, height, rotation) {
        const centerX = x + width / 2;
        const centerY = y + height / 2;
        const halfWidth = width / 2;
        const halfHeight = height / 2;

        // Convert rotation to radians
        const radians = (rotation * Math.PI) / 180;
        const cos = Math.cos(radians);
        const sin = Math.sin(radians);

        // Calculate the 4 corners of the rotated rectangle
        const corners = [
            { x: -halfWidth, y: -halfHeight }, // Top-left
            { x: halfWidth, y: -halfHeight },  // Top-right
            { x: halfWidth, y: halfHeight },   // Bottom-right
            { x: -halfWidth, y: halfHeight }   // Bottom-left
        ];

        // Rotate each corner around center
        const rotatedCorners = corners.map(corner => ({
            x: centerX + (corner.x * cos - corner.y * sin),
            y: centerY + (corner.x * sin + corner.y * cos)
        }));

        return {
            corners: rotatedCorners,
            centerX,
            centerY,
            width,
            height,
            rotation
        };
    }

    boundsOverlap(bounds1, bounds2) {
        // Use Separating Axis Theorem (SAT) for rotated rectangle collision
        const axes = this.getAxes(bounds1).concat(this.getAxes(bounds2));

        for (const axis of axes) {
            const proj1 = this.projectBounds(bounds1, axis);
            const proj2 = this.projectBounds(bounds2, axis);

            // Allow objects to touch exactly - no gap tolerance
            if (proj1.max <= proj2.min || proj2.max <= proj1.min) {
                return false; // Separating axis found, no collision
            }
        }

        return true; // No separating axis found, collision detected
    }

    getAxes(bounds) {
        const axes = [];
        const corners = bounds.corners;

        for (let i = 0; i < corners.length; i++) {
            const j = (i + 1) % corners.length;
            const edge = {
                x: corners[j].x - corners[i].x,
                y: corners[j].y - corners[i].y
            };

            // Get perpendicular (normal) to edge
            const normal = { x: -edge.y, y: edge.x };
            const length = Math.sqrt(normal.x * normal.x + normal.y * normal.y);

            if (length > 0) {
                axes.push({ x: normal.x / length, y: normal.y / length });
            }
        }

        return axes;
    }

    projectBounds(bounds, axis) {
        let min = Infinity;
        let max = -Infinity;

        for (const corner of bounds.corners) {
            const projection = corner.x * axis.x + corner.y * axis.y;
            min = Math.min(min, projection);
            max = Math.max(max, projection);
        }

        return { min, max };
    }

    rectsOverlap(rect1, rect2) {
        // Allow objects to touch exactly - no gap
        return !(rect2.left >= rect1.right ||
            rect2.right <= rect1.left ||
            rect2.top >= rect1.bottom ||
            rect2.bottom <= rect1.top);
    }

    findParentWithClass(element, className) {
        while (element && element !== document) {
            if (element.classList && element.classList.contains(className)) {
                return element;
            }
            element = element.parentNode;
        }
        return null;
    }
}



// Initialize canvas manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.canvasManager = new CanvasManager();
});
