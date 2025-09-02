// Main application controller
class SofaDesigner {
    constructor() {
        this.currentModel = null;
        this.modules = [];
        this.projects = [];
        this.searchTimeout = null;
        this.zoomLevel = 1;
        this.gridVisible = true;
        this.history = [];
        this.historyIndex = -1;
        this.maxHistory = 50;

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadModels();
        this.loadProjects();
        this.initializeTooltips();
    }

    /**
     * Helper method to safely add event listeners to DOM elements
     * Prevents errors when elements don't exist
     */
    addEventListenerSafe(elementId, event, handler) {
        const element = document.getElementById(elementId);
        if (element) {
            element.addEventListener(event, handler);
        }
    }

    setupEventListeners() {
        // Cache frequently accessed DOM elements for better performance
        const sidebarContainer = document.querySelector('.sidebar-container');
        const searchInput = document.getElementById('searchInput');
        const searchResults = document.getElementById('searchResults');

        // Sidebar toggle (mobile) - with null safety
        this.addEventListenerSafe('openSidebar', 'click', () => {
            if (sidebarContainer) sidebarContainer.classList.add('show');
        });

        this.addEventListenerSafe('closeSidebar', 'click', () => {
            if (sidebarContainer) sidebarContainer.classList.remove('show');
        });

        // Search functionality - consolidated document click listener
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                clearTimeout(this.searchTimeout);
                this.searchTimeout = setTimeout(() => {
                    this.performSearch(e.target.value);
                }, 300);
            });
        }

        // Single document click listener for search (consolidated from duplicate)
        document.addEventListener('click', (e) => {
            if (searchInput && searchResults &&
                !searchInput.contains(e.target) && !searchResults.contains(e.target)) {
                searchResults.style.display = 'none';
            }
        });

        // Export and zoom handlers - using safe event binding
        this.addEventListenerSafe('exportPDF', 'click', () => this.exportAsPDF());
        this.addEventListenerSafe('zoomReset', 'click', () => this.zoomReset());
        this.addEventListenerSafe('zoomIn', 'click', () => this.zoomIn());
        this.addEventListenerSafe('zoomOut', 'click', () => this.zoomOut());

        // Canvas controls - removed duplicate undo listener
        this.addEventListenerSafe('undoBtn', 'click', () => this.undo());
        this.addEventListenerSafe('redoBtn', 'click', () => this.redo());
        this.addEventListenerSafe('clearCanvas', 'click', () => this.clearCanvas()); this.updateModuleCount();
        this.addEventListenerSafe('gridToggle', 'click', () => this.toggleGrid());

        // Export functions
        this.addEventListenerSafe('exportJSON', 'click', () => this.exportAsJSON());

        // Project management
        this.addEventListenerSafe('saveProjectBtn', 'click', () => this.showSaveProjectModal());
        this.addEventListenerSafe('confirmSaveProject', 'click', () => this.saveProject());

        // Tab switching
        document.getElementById('modulesTab').addEventListener('click', () => {
            if (!this.currentModel) {
                this.showToast('Selecione um modelo primeiro', 'warning');
                document.getElementById('modelsTab').click();
                return false;
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch (e.key) {
                    case 'z':
                        e.preventDefault();
                        if (e.shiftKey) {
                            this.redo();
                        } else {
                            this.undo();
                        }
                        break;
                    case 's':
                        e.preventDefault();
                        this.showSaveProjectModal();
                        break;
                    case '+':
                    case '=':
                        e.preventDefault();
                        this.zoomIn();
                        break;
                    case '-':
                        e.preventDefault();
                        this.zoomOut();
                        break;
                    case '0':
                        e.preventDefault();
                        this.zoomReset();
                        break;
                }
            }

            if (e.key === 'Delete' || e.key === 'Backspace') {
                const selected = document.querySelector('.placed-module.selected');
                if (selected) {
                    e.preventDefault();
                    this.removeModule(selected);
                }
            }
        });
    }

    /**
     * Load models from API with enhanced error handling
     * Displays loading state and handles network/parsing errors gracefully
     */
    async loadModels() {
        this.showLoading(true);
        try {
            const response = await fetch('/api/models');

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const modelsByCategory = await response.json();
            this.renderModels(modelsByCategory);
        } catch (error) {
            console.error('Error loading models:', error);
            this.showToast('Erro ao carregar modelos', 'error');

            // Provide fallback empty state
            this.renderModels({});
        } finally {
            this.showLoading(false);
        }
    }

    renderModels(modelsByCategory) {
        const container = document.getElementById('modelsContainer');
        container.innerHTML = '';

        Object.entries(modelsByCategory).forEach(([category, models]) => {
            const categoryDiv = document.createElement('div');
            categoryDiv.className = 'model-category fade-in';

            const categoryTitle = document.createElement('div');
            categoryTitle.className = 'model-category-title';
            categoryTitle.textContent = category;
            categoryDiv.appendChild(categoryTitle);

            models.forEach(model => {
                const modelItem = document.createElement('div');
                modelItem.className = 'model-item slide-in';
                modelItem.dataset.modelo = model.modelo;

                modelItem.innerHTML = `
                    <div class="model-name">${model.modelo}</div>
                    <div class="model-count">${model.qtd}</div>
                `;

                modelItem.addEventListener('click', () => this.selectModel(model.modelo, modelItem));
                categoryDiv.appendChild(modelItem);
            });

            container.appendChild(categoryDiv);
        });
    }

    async selectModel(modelo, element) {
        // Update UI
        document.querySelectorAll('.model-item').forEach(item => item.classList.remove('active'));
        element.classList.add('active');

        this.currentModel = modelo;

        // Switch to modules tab and load modules
        document.getElementById('modulesTab').click();
        await this.loadModules(modelo);

        this.updateStatusMessage(`Modelo "${modelo}" selecionado`);
    }

    /**
     * Load modules for a specific model with enhanced error handling
     * @param {string} modelo - The model name to load modules for
     */
    async loadModules(modelo) {
        this.showLoading(true);
        try {
            const response = await fetch(`/api/modules?modelo=${encodeURIComponent(modelo)}`);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            this.modules = await response.json();
            this.renderModules(this.modules);
        } catch (error) {
            console.error('Error loading modules:', error);
            this.showToast('Erro ao carregar módulos', 'error');

            // Provide fallback empty state
            this.modules = [];
            this.renderModules(this.modules);
        } finally {
            this.showLoading(false);
        }
    }

    renderModules(modules) {
        const container = document.getElementById('modulesContainer');
        const noModelMessage = document.getElementById('noModelSelected');

        if (modules.length === 0) {
            container.classList.add('d-none');
            noModelMessage.classList.remove('d-none');
            return;
        }

        noModelMessage.classList.add('d-none');
        container.classList.remove('d-none');
        container.innerHTML = '';

        modules.forEach(module => {
            const moduleItem = document.createElement('div');
            moduleItem.className = 'module-item fade-in';
            moduleItem.draggable = true;
            moduleItem.dataset.moduleId = module.id;

            moduleItem.innerHTML = `
                <img src="${module.image}" alt="${module.modulo}" class="module-image">
                <div class="module-info">
                    <div class="module-name">${module.modulo}</div>
                    <div class="module-dimensions">${module.largura} × ${module.profundidade} mm</div>
                </div>
            `;

            // Drag events
            moduleItem.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('application/json', JSON.stringify(module));
                moduleItem.classList.add('dragging');
            });

            moduleItem.addEventListener('dragend', () => {
                moduleItem.classList.remove('dragging');
                this.updateModuleCount();
            });

            container.appendChild(moduleItem);
        });
    }

    async performSearch(query) {
        const searchResults = document.getElementById('searchResults');

        if (!query.trim()) {
            searchResults.style.display = 'none';
            return;
        }

        try {
            const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
            const results = await response.json();
            this.renderSearchResults(results);
        } catch (error) {
            console.error('Search error:', error);
        }
    }

    renderSearchResults(results) {
        const searchResults = document.getElementById('searchResults');
        searchResults.innerHTML = '';

        if (results.length === 0) {
            searchResults.innerHTML = '<div class="search-result-item text-muted">Nenhum resultado encontrado</div>';
        } else {
            results.forEach(result => {
                const item = document.createElement('div');
                item.className = 'search-result-item';
                item.innerHTML = `
                    <div><strong>${result.modelo}</strong></div>
                   
                `;

                item.addEventListener('click', () => {
                    this.selectModelFromSearch(result.modelo);
                    searchResults.style.display = 'none';
                    document.getElementById('searchInput').value = '';
                });

                searchResults.appendChild(item);
            });
        }

        searchResults.style.display = 'block';
    }

    selectModelFromSearch(modelo) {
        const modelElement = document.querySelector(`[data-modelo="${modelo}"]`);
        if (modelElement) {
            modelElement.click();
            document.getElementById('modelsTab').click();
            modelElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    // Zoom functions
    zoomIn() {
        this.zoomLevel = Math.min(this.zoomLevel * 1.2, 3);
        this.applyZoom();
    }

    zoomOut() {
        this.zoomLevel = Math.max(this.zoomLevel / 1.2, 0.2);
        this.applyZoom();
    }

    zoomReset() {
        this.zoomLevel = 1;
        this.applyZoom();
    }

    applyZoom() {
        const workspace = document.getElementById('canvasWorkspace');
        workspace.style.transform = `scale(${this.zoomLevel})`;
        document.getElementById('zoomLevel').textContent = `${Math.round(this.zoomLevel * 100)}%`;
    }

    // History management
    saveState() {
        const state = this.getCanvasState();

        // Remove future history if we're not at the end
        this.history = this.history.slice(0, this.historyIndex + 1);

        // Add new state
        this.history.push(state);

        // Limit history size
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        } else {
            this.historyIndex++;
        }

        this.updateHistoryButtons();
    }

    undo() {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            this.restoreState(this.history[this.historyIndex]);
            this.updateHistoryButtons();
        }
    }

    redo() {
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            this.restoreState(this.history[this.historyIndex]);
            this.updateHistoryButtons();
        }
    }

    updateHistoryButtons() {
        document.getElementById('undoBtn').disabled = this.historyIndex <= 0;
        document.getElementById('redoBtn').disabled = this.historyIndex >= this.history.length - 1;
    }

    getCanvasState() {
        const modules = Array.from(document.querySelectorAll('.placed-module')).map(module => ({
            id: module.dataset.moduleId,
            x: parseInt(module.style.left),
            y: parseInt(module.style.top),
            width: parseInt(module.style.width),
            height: parseInt(module.style.height),
            rotation: parseInt(module.dataset.rotation || 0),
            flipX: parseFloat(module.dataset.flipX || 1),
            flipY: parseFloat(module.dataset.flipY || 1),
            src: module.querySelector('img').src,
            data: JSON.parse(module.dataset.moduleData || '{}')
        }));

        return { modules, timestamp: Date.now() };
    }

    restoreState(state) {
    const canvas = document.getElementById('canvasSheet');
    canvas.innerHTML = '';

    state.modules.forEach(moduleData => {
        const el = canvasManager.createPlacedModule(
            moduleData.data,
            moduleData.x,
            moduleData.y,
            false,
            {
                rotation: moduleData.rotation,
                flipX: moduleData.flipX,
                flipY: moduleData.flipY
            }
        );

        el.style.width = moduleData.width + 'px';
        el.style.height = moduleData.height + 'px';
    });

    this.updateModuleCount();
}

    // Canvas management
    clearCanvas() {
        if (confirm('Tem certeza que deseja limpar todo o canvas?')) {
            this.saveState();
            document.getElementById('canvasSheet').innerHTML = '';
            this.updateModuleCount();
            this.showToast('Canvas limpo', 'info');
        }
    }

    toggleGrid() {
        const sheet = document.getElementById('canvasSheet');
        sheet.classList.toggle('no-grid');
        this.gridVisible = !this.gridVisible;

        const button = document.getElementById('gridToggle');
        button.classList.toggle('active', this.gridVisible);

        this.showToast(this.gridVisible ? 'Grid ativado' : 'Grid desativado', 'info');
    }

    removeModule(moduleElement) {
        this.saveState();
        moduleElement.remove();
        this.updateModuleCount();
        this.showToast('Módulo removido', 'info');
    }

updateModuleCount() {
    const modules = document.querySelectorAll('.placed-module');
    document.getElementById('moduleCount').textContent =
        `${modules.length} módulo${modules.length !== 1 ? 's' : ''}`;

    if (modules.length === 0) {
        document.getElementById('canvasSize').textContent = 'Área ocupada - 0 × 0 cm';
        return;
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    modules.forEach(m => {
        const left = parseInt(m.style.left) || 0;
        const top = parseInt(m.style.top) || 0;
        const width = parseInt(m.style.width) || m.offsetWidth;
        const height = parseInt(m.style.height) || m.offsetHeight;

        minX = Math.min(minX, left);
        minY = Math.min(minY, top);
        maxX = Math.max(maxX, left + width);
        maxY = Math.max(maxY, top + height);
    });

    const width = maxX - minX;
    const height = maxY - minY;

    const pxToCm = 0.5;
    const widthCm = Math.round(width * pxToCm);
    const heightCm = Math.round(height * pxToCm);

    document.getElementById("canvasSize").textContent =
        `Área ocupada - ${widthCm} × ${heightCm} cm`;
}

    updateStatusMessage(message) {
        document.getElementById('statusMessage').textContent = message;

    }

    /////////////////////////////////////////////////////////////////////////////////////
    async exportAsPDF() {
        const canvasEl = document.getElementById('canvasSheet');
        const modules = Array.from(canvasEl.querySelectorAll('.placed-module'));

        if (modules.length === 0) {
            this.showToast('Nenhum módulo para exportar', 'warning');
            return;
        }

        // Reset zoom e espera para aplicar
        this.zoomReset();
        await new Promise(resolve => setTimeout(resolve, 100));

        // Calcular bounding box ocupada
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        modules.forEach(m => {
            const x = parseInt(m.style.left) || 0;
            const y = parseInt(m.style.top) || 0;
            const w = m.offsetWidth;
            const h = m.offsetHeight;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x + w);
            maxY = Math.max(maxY, y + h);
        });

        const width = maxX - minX;
        const height = maxY - minY;


        const margin = 20;

        // Salvar estado atual da grid
        const hadGrid = !canvasEl.classList.contains('no-grid');

        // Remover grid temporariamente
        canvasEl.classList.add('no-grid');

        // Adicionar fundo branco temporariamente
        const originalBackground = canvasEl.style.background;
        canvasEl.style.background = '#ffffff';

        // Aplicar estilos de exportação
        canvasEl.classList.add('export-mode');

        try {
            const canvasImg = await html2canvas(canvasEl, {
                backgroundColor: '#ffffff',
                scale: 2,
                x: Math.max(minX - margin, 0),
                y: Math.max(minY - margin, 0),
                width: width + margin * 2,
                height: height + margin * 2,
                useCORS: true,
                logging: false
            });

            const imgData = canvasImg.toDataURL("image/png");

            // Criar PDF com margens
            const pdf = new jspdf.jsPDF('p', 'mm', 'a4');
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();

            // Definir margens
            const marginLeft = 15;
            const marginRight = 15;
            const marginTop = 25;
            const marginBottom = 20;
            const contentWidth = pageWidth - marginLeft - marginRight;

            // Adicionar fundo branco
            pdf.setFillColor(255, 255, 255);
            pdf.rect(0, 0, pageWidth, pageHeight, "F");

            // Cabeçalho com logo e título
            pdf.setDrawColor(100, 100, 100);
            pdf.setLineWidth(0.5);
            pdf.line(marginLeft, marginTop, pageWidth - marginRight, marginTop);

            // Adicionar título
            pdf.setFontSize(16);
            pdf.setTextColor(60, 60, 60);
            pdf.setFont("helvetica", "normal");
            pdf.text("Layout de Sofá", pageWidth / 2, marginTop - 8, { align: 'center' });

            //Adicionar logo (substitua com a URL da sua logo)
            try {
                const logoData = await this.getBase64ImageFromURL('static/images/logo_lider.png');
                pdf.addImage(logoData, 'PNG', marginLeft, marginTop - 12, 24, 8);
            } catch (e) {
                console.log('Logo não carregada:', e);
            }

            // Ajustar a imagem na página
            const imgMaxWidth = contentWidth;
            const imgMaxHeight = pageHeight - marginTop - marginBottom - 60; // Deixar espaço para a listagem

            let ratio = Math.min(imgMaxWidth / width, imgMaxHeight / height);
            let imgW = width * ratio;
            let imgH = height * ratio;

            // Centralizar imagem horizontalmente
            const imgX = marginLeft + (contentWidth - imgW) / 2;
            const imgY = marginTop + 10;

            // Adicionar a imagem
            pdf.addImage(imgData, "PNG", imgX, imgY, imgW, imgH);

            // Listagem de módulos com quadro
            const listY = imgY + imgH + 15;

            // Desenhar quadro
            pdf.setDrawColor(200, 200, 200);
            pdf.setFillColor(248, 249, 250); // Cor de fundo cinza claro
            pdf.roundedRect(marginLeft, listY, contentWidth, pageHeight - listY - marginBottom, 2, 2, 'F');
            pdf.roundedRect(marginLeft, listY, contentWidth, pageHeight - listY - marginBottom, 2, 2, 'S');

            // Título da listagem
            pdf.setFontSize(12);
            pdf.setTextColor(60, 60, 60);
            pdf.setFont(undefined, 'bold');
            pdf.text("LISTA DE MÓDULOS", marginLeft + 10, listY + 8);

            // Linha separadora
            pdf.setDrawColor(200, 200, 200);
            pdf.line(marginLeft + 10, listY + 11, marginLeft + contentWidth - 10, listY + 11);

            // Conteúdo da listagem
            pdf.setFontSize(10);
            pdf.setTextColor(80, 80, 80);
            pdf.setFont(undefined, 'normal');

            const state = this.getCanvasState();
            let yPos = listY + 18;
            const lineHeight = 6;
            const col1 = marginLeft + 10;
            const col2 = col1 + 40;
            const col3 = col2 + 50;
            const col4 = col3 + 40;

            // Cabeçalho da tabela
            pdf.setFont(undefined, 'bold');
            pdf.text("#", col1, yPos);
            pdf.text("Modelo", col2, yPos);
            pdf.text("Módulo", col3, yPos);
            pdf.text("Medidas (mm)", col4, yPos);

            yPos += lineHeight + 2;
            pdf.setDrawColor(220, 220, 220);
            pdf.line(col1, yPos - 5, marginLeft + contentWidth - 10, yPos - 5);

            // Dados dos módulos
            pdf.setFont(undefined, 'normal');
            state.modules.forEach((m, idx) => {
                // Verificar se precisa de nova página
                if (yPos > pageHeight - marginBottom - lineHeight) {
                    pdf.addPage();

                    // Redesenhar o quadro na nova página
                    pdf.setFillColor(248, 249, 250);
                    pdf.roundedRect(marginLeft, marginTop, contentWidth, pageHeight - marginTop - marginBottom, 2, 2, 'F');
                    pdf.roundedRect(marginLeft, marginTop, contentWidth, pageHeight - marginTop - marginBottom, 2, 2, 'S');

                    yPos = marginTop + 8;

                    // Recriar cabeçalho da tabela
                    pdf.setFont(undefined, 'bold');
                    pdf.text("#", col1, yPos);
                    pdf.text("Modelo", col2, yPos);
                    pdf.text("Módulo", col3, yPos);
                    pdf.text("Medidas (mm)", col4, yPos);

                    yPos += lineHeight + 2;
                    pdf.line(col1, yPos - 1, marginLeft + contentWidth - 10, yPos - 1);
                }

                const { modelo, modulo, largura, profundidade } = m.data;

                pdf.text(`${idx + 1}`, col1, yPos);
                pdf.text(modelo || '-', col2, yPos);
                pdf.text(modulo, col3, yPos);
                pdf.text(`${largura} × ${profundidade}`, col4, yPos);

                yPos += lineHeight;
            });

            // Rodapé com data e hora
            pdf.setFontSize(8);
            pdf.setTextColor(150, 150, 150);
            const dateTime = new Date().toLocaleString('pt-BR');
            pdf.text(`Gerado em: ${dateTime}`, pageWidth / 2, pageHeight - 10, { align: 'center' });

            pdf.save(`sofa-layout-${Date.now()}.pdf`);
            this.showToast('PDF exportado com sucesso', 'success');
        } catch (error) {
            console.error('Erro ao exportar PDF:', error);
            this.showToast('Erro ao exportar PDF', 'error');
        } finally {
            // Restaurar estado original
            canvasEl.style.background = originalBackground;
            canvasEl.classList.remove('export-mode');
            if (hadGrid) {
                canvasEl.classList.remove('no-grid');
            }
        }
    }

    // Adicione este método para carregar imagens (se for usar logo)
    getBase64ImageFromURL(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'Anonymous';
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.height = img.naturalHeight;
                canvas.width = img.naturalWidth;
                ctx.drawImage(img, 0, 0);
                const dataURL = canvas.toDataURL();
                resolve(dataURL);
            };
            img.onerror = error => reject(error);
            img.src = url;
        });
    }
    ////////////////////////////////////////////////////////////////////////////////////



    ////////////////////////////////////////////////////////////////////////////////////





    // Project management
    async loadProjects() {
        try {
            const response = await fetch('/api/projects');
            this.projects = await response.json();
            this.renderProjects(this.projects);
        } catch (error) {
            console.error('Error loading projects:', error);
        }
    }

    renderProjects(projects) {
        const container = document.getElementById('projectsContainer');
        container.innerHTML = '';

        if (projects.length === 0) {
            container.innerHTML = `
                <div class="text-center p-4 text-muted">
                    <i class="fas fa-folder-open fa-2x mb-2"></i>
                    <p>Nenhum projeto salvo ainda.</p>
                </div>
            `;
            return;
        }

        projects.forEach(project => {
            const projectItem = document.createElement('div');
            projectItem.className = 'project-item fade-in';

            projectItem.innerHTML = `
                <div class="project-name">${project.name}</div>
                <div class="project-description">${project.description || 'Sem descrição'}</div>
                <div class="project-meta">
                    <span>Criado em ${new Date(project.created_at).toLocaleDateString('pt-BR')}</span>
                    <div class="project-actions">
                        <button class="btn btn-sm btn-outline-primary" onclick="sofaDesigner.loadProject(${project.id})">
                            <i class="fas fa-folder-open"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-danger" onclick="sofaDesigner.deleteProject(${project.id})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;

            container.appendChild(projectItem);
        });
    }

    showSaveProjectModal() {
        const modal = new bootstrap.Modal(document.getElementById('saveProjectModal'));
        modal.show();
    }

    async saveProject() {
        const name = document.getElementById('projectName').value.trim();
        const description = document.getElementById('projectDescription').value.trim();

        if (!name) {
            this.showToast('Nome do projeto é obrigatório', 'warning');
            return;
        }

        const layoutData = this.getCanvasState();

        try {
            const response = await fetch('/api/projects', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name,
                    description,
                    layout_data: layoutData
                })
            });

            if (response.ok) {
                this.showToast('Projeto salvo com sucesso!', 'success');
                bootstrap.Modal.getInstance(document.getElementById('saveProjectModal')).hide();
                document.getElementById('saveProjectForm').reset();
                this.loadProjects();
            } else {
                throw new Error('Erro ao salvar projeto');
            }
        } catch (error) {
            console.error('Save project error:', error);
            this.showToast('Erro ao salvar projeto', 'error');
        }
    }

    async loadProject(projectId) {
        try {
            const response = await fetch(`/api/projects/${projectId}`);
            const project = await response.json();

            if (confirm(`Carregar projeto "${project.name}"? Isso substituirá o conteúdo atual do canvas.`)) {
                this.restoreState(project.layout_data);
                this.showToast(`Projeto "${project.name}" carregado`, 'success');
            }
        } catch (error) {
            console.error('Load project error:', error);
            this.showToast('Erro ao carregar projeto', 'error');
        }
    }

    async deleteProject(projectId) {
        if (confirm('Tem certeza que deseja excluir este projeto?')) {
            try {
                const response = await fetch(`/api/projects/${projectId}`, {
                    method: 'DELETE'
                });

                if (response.ok) {
                    this.showToast('Projeto excluído com sucesso', 'success');
                    this.loadProjects();
                } else {
                    throw new Error('Erro ao excluir projeto');
                }
            } catch (error) {
                console.error('Delete project error:', error);
                this.showToast('Erro ao excluir projeto', 'error');
            }
        }
    }

    // Export functions
    exportAsPNG() {
        // Implementation would use html2canvas or similar library
        this.showToast('Exportação PNG em desenvolvimento', 'info');
    }

    exportAsJSON() {
        const data = this.getCanvasState();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `sofa-layout-${Date.now()}.json`;
        a.click();

        URL.revokeObjectURL(url);
        this.showToast('Layout exportado como JSON', 'success');
    }

    // Utility functions
    showLoading(show) {
        const overlay = document.getElementById('loadingOverlay');
        overlay.classList.toggle('d-none', !show);
    }

    showToast(message, type = 'info') {
        // Create toast container if it doesn't exist
        let container = document.querySelector('.toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'toast-container';
            document.body.appendChild(container);
        }

        // Create toast element
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <div class="toast-body d-flex align-items-center">
                <i class="fas fa-${this.getToastIcon(type)} me-2"></i>
                ${message}
                <button type="button" class="btn-close ms-auto" data-bs-dismiss="toast"></button>
            </div>
        `;

        container.appendChild(toast);

        // Initialize and show toast
        const bsToast = new bootstrap.Toast(toast, { delay: 3000 });
        bsToast.show();

        // Remove element after hiding
        toast.addEventListener('hidden.bs.toast', () => {
            toast.remove();
        });
    }

    getToastIcon(type) {
        const icons = {
            success: 'check-circle',
            error: 'exclamation-circle',
            warning: 'exclamation-triangle',
            info: 'info-circle'
        };
        return icons[type] || 'info-circle';
    }

    initializeTooltips() {
        // Initialize Bootstrap tooltips
        const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
        tooltipTriggerList.map(function (tooltipTriggerEl) {
            return new bootstrap.Tooltip(tooltipTriggerEl);
        });
    }
}

function updateStatusBarPosition() {
    const sidebar = document.getElementById('sidebar');
    const statusBar = document.getElementById('statusBar');
    const sidebarWidth = sidebar.offsetWidth;

    statusBar.style.left = `${sidebarWidth}px`;
    statusBar.style.width = `calc(100% - ${sidebarWidth}px)`;
}

// Atualiza ao carregar a página
window.addEventListener('load', updateStatusBarPosition);

// Atualiza se a janela mudar de tamanho
window.addEventListener('resize', updateStatusBarPosition);

// Initialize application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.sofaDesigner = new SofaDesigner();
});
