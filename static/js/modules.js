// Module management and interaction utilities
class ModuleManager {
    constructor() {
        this.moduleDatabase = new Map();
        this.categories = new Set();
        this.filters = {
            category: 'all',
            search: '',
            dimensions: { min: null, max: null }
        };
        
        this.init();
    }

    init() {
        this.setupModuleFilters();
        this.setupModulePreview();
    }

    setupModuleFilters() {
        // Category filter
        const categoryFilter = this.createCategoryFilter();
        const modulesContainer = document.getElementById('modulesContainer');
        
        if (modulesContainer) {
            const filterContainer = document.createElement('div');
            filterContainer.className = 'module-filters mb-3';
            filterContainer.appendChild(categoryFilter);
            modulesContainer.parentNode.insertBefore(filterContainer, modulesContainer);
        }
    }

    createCategoryFilter() {
        const container = document.createElement('div');
        container.className = 'category-filter mb-2';
        
        const label = document.createElement('label');
        label.className = 'form-label small';
        label.textContent = 'Filtrar por categoria:';
        
        const select = document.createElement('select');
        select.className = 'form-select form-select-sm';
        select.innerHTML = '<option value="all">Todas as categorias</option>';
        
        select.addEventListener('change', (e) => {
            this.filters.category = e.target.value;
            this.applyFilters();
        });
        
        container.appendChild(label);
        container.appendChild(select);
        
        return container;
    }

    updateCategories(modules) {
        this.categories.clear();
        modules.forEach(module => {
            if (module.categoria) {
                this.categories.add(module.categoria);
            }
        });
        
        this.updateCategoryFilter();
    }

    updateCategoryFilter() {
        const select = document.querySelector('.category-filter select');
        if (!select) return;
        
        // Keep current selection
        const currentValue = select.value;
        
        // Clear and rebuild options
        select.innerHTML = '<option value="all">Todas as categorias</option>';
        
        Array.from(this.categories).sort().forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            select.appendChild(option);
        });
        
        // Restore selection if still valid
        if (Array.from(select.options).some(opt => opt.value === currentValue)) {
            select.value = currentValue;
        }
    }

    applyFilters() {
        const moduleItems = document.querySelectorAll('.module-item');
        
        moduleItems.forEach(item => {
            const moduleData = JSON.parse(item.dataset.moduleData || '{}');
            let show = true;
            
            // Category filter
            if (this.filters.category !== 'all') {
                show = show && moduleData.categoria === this.filters.category;
            }
            
            // Search filter (if needed in the future)
            if (this.filters.search) {
                const searchText = this.filters.search.toLowerCase();
                const moduleText = `${moduleData.modulo} ${moduleData.modelo}`.toLowerCase();
                show = show && moduleText.includes(searchText);
            }
            
            item.style.display = show ? 'flex' : 'none';
        });
        
        this.updateFilterSummary();
    }

    updateFilterSummary() {
        const visible = document.querySelectorAll('.module-item[style*="flex"], .module-item:not([style*="none"])').length;
        const total = document.querySelectorAll('.module-item').length;
        
        let summary = document.querySelector('.filter-summary');
        if (!summary) {
            summary = document.createElement('div');
            summary.className = 'filter-summary small text-muted mb-2';
            const container = document.getElementById('modulesContainer');
            container.parentNode.insertBefore(summary, container);
        }
        
        if (visible < total) {
            summary.textContent = `Mostrando ${visible} de ${total} módulos`;
            summary.style.display = 'block';
        } else {
            summary.style.display = 'none';
        }
    }

    //setupModulePreview() {
        // Add hover preview functionality
       // document.addEventListener('mouseenter', (e) => {
        //    const moduleItem = this.findParentWithClass(e.target, 'module-item');
        //    if (moduleItem) {
        //        this.showModulePreview(moduleItem);
        //    }
        //}, true);
        
       // document.addEventListener('mouseleave', (e) => {
       //     const moduleItem = this.findParentWithClass(e.target, 'module-item');
       //     if (moduleItem) {
       //         this.hideModulePreview();
       //     }
       // }, true);
   // }

    findParentWithClass(element, className) {
        while (element && element !== document) {
            if (element.classList && element.classList.contains(className)) {
                return element;
            }
            element = element.parentNode;
        }
        return null;
    }

    showModulePreview(moduleItem) {
        const moduleData = JSON.parse(moduleItem.dataset.moduleData || '{}');
        
        // Create preview tooltip
        let preview = document.getElementById('modulePreview');
        if (!preview) {
            preview = document.createElement('div');
            preview.id = 'modulePreview';
            preview.className = 'module-preview position-fixed bg-white border shadow p-2';
            preview.style.cssText = `
                z-index: 1060;
                border-radius: 6px;
                max-width: 200px;
                pointer-events: none;
                display: none;
            `;
            document.body.appendChild(preview);
        }
        
        preview.innerHTML = `
            <div class="text-center">
                <img src="${moduleData.image}" alt="${moduleData.modulo}" 
                     style="max-width: 100px; max-height: 80px; object-fit: contain;" class="mb-2">
                <div class="fw-bold small">${moduleData.modulo}</div>
                <div class="text-muted small">${moduleData.largura} × ${moduleData.profundidade} mm</div>
                <div class="text-muted small">Modelo: ${moduleData.modelo}</div>
            </div>
        `;
        
        // Position preview
        const rect = moduleItem.getBoundingClientRect();
        preview.style.left = (rect.right + 10) + 'px';
        preview.style.top = rect.top + 'px';
        preview.style.display = 'block';
    }

    hideModulePreview() {
        const preview = document.getElementById('modulePreview');
        if (preview) {
            preview.style.display = 'none';
        }
    }

    // Module validation and helper functions
    validateModulePlacement(moduleData, x, y, canvasWidth, canvasHeight) {
        const width = moduleData.largura * canvasManager.pixelsPerMM;
        const height = moduleData.profundidade * canvasManager.pixelsPerMM;
        
        // Check bounds
        if (x < 0 || y < 0 || x + width > canvasWidth || y + height > canvasHeight) {
            return {
                valid: false,
                reason: 'Módulo não cabe na posição especificada'
            };
        }
        
        // Check collision
        if (canvasManager.hasCollision(null, x, y, width, height)) {
            return {
                valid: false,
                reason: 'Posição ocupada por outro módulo'
            };
        }
        
        return { valid: true };
    }

    getOptimalPlacement(moduleData) {
        const canvas = document.getElementById('canvasSheet');
        const width = moduleData.largura * canvasManager.pixelsPerMM;
        const height = moduleData.profundidade * canvasManager.pixelsPerMM;
        
        // Try to find empty space
        const step = 20;
        for (let y = 0; y <= canvas.clientHeight - height; y += step) {
            for (let x = 0; x <= canvas.clientWidth - width; x += step) {
                if (!canvasManager.hasCollision(null, x, y, width, height)) {
                    return { x, y };
                }
            }
        }
        
        // If no space found, return center (user will need to move manually)
        return {
            x: (canvas.clientWidth - width) / 2,
            y: (canvas.clientHeight - height) / 2
        };
    }

    // Module database management
    addModuleToDatabase(moduleData) {
        this.moduleDatabase.set(moduleData.id, moduleData);
        if (moduleData.categoria) {
            this.categories.add(moduleData.categoria);
        }
    }

    getModuleFromDatabase(moduleId) {
        return this.moduleDatabase.get(moduleId);
    }

    // Module configuration and customization
    showModuleConfiguration(moduleElement) {
        const moduleData = JSON.parse(moduleElement.dataset.moduleData);
        
        // Create configuration modal (if needed in the future)
        const modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.innerHTML = `
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Configurar Módulo</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="mb-3">
                            <label class="form-label">Nome:</label>
                            <input type="text" class="form-control" value="${moduleData.modulo}" readonly>
                        </div>
                        <div class="mb-3">
                            <label class="form-label">Dimensões:</label>
                            <input type="text" class="form-control" value="${moduleData.largura} × ${moduleData.profundidade} mm" readonly>
                        </div>
                        <div class="mb-3">
                            <label class="form-label">Posição:</label>
                            <div class="row">
                                <div class="col">
                                    <input type="number" class="form-control" placeholder="X" value="${parseInt(moduleElement.style.left)}">
                                </div>
                                <div class="col">
                                    <input type="number" class="form-control" placeholder="Y" value="${parseInt(moduleElement.style.top)}">
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button>
                        <button type="button" class="btn btn-primary">Aplicar</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        const bsModal = new bootstrap.Modal(modal);
        bsModal.show();
        
        modal.addEventListener('hidden.bs.modal', () => {
            modal.remove();
        });
    }

    // Batch operations
    selectAllModules() {
        document.querySelectorAll('.placed-module').forEach(module => {
            module.classList.add('selected');
        });
    }

    deleteSelectedModules() {
        const selected = document.querySelectorAll('.placed-module.selected');
        if (selected.length === 0) {
            sofaDesigner.showToast('Nenhum módulo selecionado', 'warning');
            return;
        }
        
        if (confirm(`Excluir ${selected.length} módulo(s) selecionado(s)?`)) {
            sofaDesigner.saveState();
            selected.forEach(module => module.remove());
            sofaDesigner.updateModuleCount();
            sofaDesigner.showToast(`${selected.length} módulo(s) removido(s)`, 'success');
        }
    }

    alignSelectedModules(direction) {
        const selected = Array.from(document.querySelectorAll('.placed-module.selected'));
        if (selected.length < 2) {
            sofaDesigner.showToast('Selecione pelo menos 2 módulos para alinhar', 'warning');
            return;
        }
        
        sofaDesigner.saveState();
        
        switch (direction) {
            case 'left':
                const leftMost = Math.min(...selected.map(m => parseInt(m.style.left)));
                selected.forEach(m => m.style.left = leftMost + 'px');
                break;
            case 'right':
                const rightMost = Math.max(...selected.map(m => parseInt(m.style.left) + m.offsetWidth));
                selected.forEach(m => m.style.left = (rightMost - m.offsetWidth) + 'px');
                break;
            case 'top':
                const topMost = Math.min(...selected.map(m => parseInt(m.style.top)));
                selected.forEach(m => m.style.top = topMost + 'px');
                break;
            case 'bottom':
                const bottomMost = Math.max(...selected.map(m => parseInt(m.style.top) + m.offsetHeight));
                selected.forEach(m => m.style.top = (bottomMost - m.offsetHeight) + 'px');
                break;
        }
        
        sofaDesigner.showToast(`Módulos alinhados à ${direction}`, 'success');
    }

    distributeSelectedModules(direction) {
        const selected = Array.from(document.querySelectorAll('.placed-module.selected'));
        if (selected.length < 3) {
            sofaDesigner.showToast('Selecione pelo menos 3 módulos para distribuir', 'warning');
            return;
        }
        
        sofaDesigner.saveState();
        
        if (direction === 'horizontal') {
            selected.sort((a, b) => parseInt(a.style.left) - parseInt(b.style.left));
            const first = parseInt(selected[0].style.left);
            const last = parseInt(selected[selected.length - 1].style.left);
            const spacing = (last - first) / (selected.length - 1);
            
            selected.forEach((module, index) => {
                module.style.left = (first + spacing * index) + 'px';
            });
        } else {
            selected.sort((a, b) => parseInt(a.style.top) - parseInt(b.style.top));
            const first = parseInt(selected[0].style.top);
            const last = parseInt(selected[selected.length - 1].style.top);
            const spacing = (last - first) / (selected.length - 1);
            
            selected.forEach((module, index) => {
                module.style.top = (first + spacing * index) + 'px';
            });
        }
        
        sofaDesigner.showToast(`Módulos distribuídos ${direction === 'horizontal' ? 'horizontalmente' : 'verticalmente'}`, 'success');
    }
}

// Initialize module manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.moduleManager = new ModuleManager();
});
