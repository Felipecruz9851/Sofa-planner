import os
import sqlite3
import json
from datetime import datetime
from flask import Flask, render_template, jsonify, request, session
from werkzeug.utils import secure_filename


app = Flask(__name__)
app.secret_key = os.environ.get("SESSION_SECRET", "dev-secret-key-change-in-production")
app.config['UPLOAD_FOLDER'] = os.path.join(app.root_path, 'static', 'images')

DB_PATH = "sofas.db"
DATABASE = DB_PATH
UPLOAD_FOLDER = 'static/images'
ALLOWED_EXTENSIONS = {'png'}

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def get_db():
    """Get database connection with row factory"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Initialize database with required tables"""
    with get_db() as conn:
        # Create modules table if it doesn't exist
        conn.execute('''
            CREATE TABLE IF NOT EXISTS modules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                MODELO TEXT NOT NULL,
                MODULO TEXT NOT NULL,
                LARGURA REAL NOT NULL,
                PROFUNDIDADE REAL NOT NULL,
                image TEXT NOT NULL,
                categoria TEXT DEFAULT 'Geral',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Create projects table for saving layouts
        conn.execute('''
            CREATE TABLE IF NOT EXISTS projects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                layout_data TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        conn.commit()

# Initialize database on app start
init_db()

@app.route("/")
def index():
    """Main application page"""
    return render_template("index.html")

@app.route("/cadastro")
def index_cad():
    """Gerenciador de módulos"""
    return render_template("cadastro.html")

@app.route("/api/models")
def api_models():
    """Get list of unique models with module counts"""
    try:
        with get_db() as conn:
            cur = conn.execute("""
                SELECT MODELO, COUNT(*) AS qtd, categoria
                FROM modules
                GROUP BY MODELO, categoria
                ORDER BY categoria, MODELO
            """)
            rows = cur.fetchall()
        
        # Group by category
        models_by_category = {}
        for row in rows:
            categoria = row["categoria"] or "Geral"
            if categoria not in models_by_category:
                models_by_category[categoria] = []
            models_by_category[categoria].append({
                "modelo": row["MODELO"],
                "qtd": row["qtd"],
                "categoria": categoria
            })
        
        return jsonify(models_by_category)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/modules")
def api_modules():
    """Get modules for a specific model"""
    modelo = request.args.get("modelo")
    if not modelo:
        return jsonify({"error": "parâmetro 'modelo' é obrigatório"}), 400
    
    try:
        with get_db() as conn:
            cur = conn.execute("""
                SELECT id, MODELO, MODULO, LARGURA, PROFUNDIDADE, image, categoria
                FROM modules
                WHERE MODELO = ?
                ORDER BY MODULO
            """, (modelo,))
            rows = cur.fetchall()
        
        modules = [{
            "id": row["id"],
            "modelo": row["MODELO"],
            "modulo": row["MODULO"],
            "largura": row["LARGURA"],
            "profundidade": row["PROFUNDIDADE"],
            "image": row["image"],
            "categoria": row["categoria"] or "Geral"
        } for row in rows]
        
        return jsonify(modules)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/search")
def api_search():
    """Search only models"""
    query = request.args.get("q", "").strip()
    if not query:
        return jsonify([])
    
    try:
        with get_db() as conn:
            cur = conn.execute("""
                SELECT DISTINCT MODELO
                FROM modules
                WHERE MODELO LIKE ?
                ORDER BY MODELO
                LIMIT 20
            """, (f"%{query}%",))
            rows = cur.fetchall()
        
        results = [{
            "modelo": row["MODELO"],
            "type": "model"
        } for row in rows]
        
        return jsonify(results)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/projects", methods=["GET", "POST"])
def api_projects():
    """Handle project operations"""
    if request.method == "POST":
        # Save new project
        data = request.get_json()
        if not data or not data.get("name") or not data.get("layout_data"):
            return jsonify({"error": "Nome e dados do layout são obrigatórios"}), 400
        
        try:
            with get_db() as conn:
                cur = conn.execute("""
                    INSERT INTO projects (name, description, layout_data)
                    VALUES (?, ?, ?)
                """, (data["name"], data.get("description", ""), json.dumps(data["layout_data"])))
                project_id = cur.lastrowid
                conn.commit()
            
            return jsonify({"id": project_id, "message": "Projeto salvo com sucesso"})
        except Exception as e:
            return jsonify({"error": str(e)}), 500
    
    else:
        # Get all projects
        try:
            with get_db() as conn:
                cur = conn.execute("""
                    SELECT id, name, description, created_at, updated_at
                    FROM projects
                    ORDER BY updated_at DESC
                """)
                rows = cur.fetchall()
            
            projects = [{
                "id": row["id"],
                "name": row["name"],
                "description": row["description"],
                "created_at": row["created_at"],
                "updated_at": row["updated_at"]
            } for row in rows]
            
            return jsonify(projects)
        except Exception as e:
            return jsonify({"error": str(e)}), 500

@app.route("/api/projects/<int:project_id>", methods=["GET", "PUT", "DELETE"])
def api_project_detail(project_id):
    """Handle individual project operations"""
    if request.method == "GET":
        # Get project details
        try:
            with get_db() as conn:
                cur = conn.execute("""
                    SELECT id, name, description, layout_data, created_at, updated_at
                    FROM projects
                    WHERE id = ?
                """, (project_id,))
                row = cur.fetchone()
            
            if not row:
                return jsonify({"error": "Projeto não encontrado"}), 404
            
            project = {
                "id": row["id"],
                "name": row["name"],
                "description": row["description"],
                "layout_data": json.loads(row["layout_data"]),
                "created_at": row["created_at"],
                "updated_at": row["updated_at"]
            }
            
            return jsonify(project)
        except Exception as e:
            return jsonify({"error": str(e)}), 500
    
    elif request.method == "PUT":
        # Update project
        data = request.get_json()
        if not data:
            return jsonify({"error": "Dados inválidos"}), 400
        
        try:
            with get_db() as conn:
                conn.execute("""
                    UPDATE projects 
                    SET name = ?, description = ?, layout_data = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                """, (
                    data.get("name", ""),
                    data.get("description", ""),
                    json.dumps(data.get("layout_data", {})),
                    project_id
                ))
                conn.commit()
            
            return jsonify({"message": "Projeto atualizado com sucesso"})
        except Exception as e:
            return jsonify({"error": str(e)}), 500
    
    elif request.method == "DELETE":
        # Delete project
        try:
            with get_db() as conn:
                conn.execute("DELETE FROM projects WHERE id = ?", (project_id,))
                conn.commit()
            
            return jsonify({"message": "Projeto excluído com sucesso"})
        except Exception as e:
            return jsonify({"error": str(e)}), 500
#################################
def _normalize_image_field(image_value):
    """Normaliza o campo de imagem para retornar o caminho correto"""
    if not image_value:
        return ""
    # Se já começa com 'static/', retorna como está
    if image_value.startswith("static/"):
        return image_value
    # Caso contrário, assume que está na pasta de upload
    return f"static/images/{image_value}"

# Endpoint para listar todos os módulos
@app.route('/api/modulos', methods=['GET'])
def get_modulos():
    conn = get_db()
    rows = conn.execute('''
        SELECT id, MODELO, MODULO, LARGURA, PROFUNDIDADE, image, categoria, created_at
        FROM modules
        ORDER BY MODELO, MODULO
    ''').fetchall()
    conn.close()

    modules_list = []
    for row in rows:
        row_dict = dict(row)  # mantém as chaves como no DB (MODELO, MODULO, image, ...)
        # normaliza apenas o campo de imagem
        if 'image' in row_dict:
            row_dict['image'] = _normalize_image_field(row_dict.get('image'))
        elif 'IMAGEM' in row_dict:  # por precaução se seu DB tiver outra variação
            row_dict['IMAGEM'] = _normalize_image_field(row_dict.get('IMAGEM'))

        modules_list.append(row_dict)

    return jsonify(modules_list)


# Endpoint para cadastrar um novo módulo
@app.route('/api/modulos', methods=['POST'])
def add_module():
    if 'image' not in request.files:
        return jsonify({'error': 'No image part in the request'}), 400

    file = request.files['image']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)

        data = request.form
        if not all(key in data for key in ['MODELO', 'MODULO', 'LARGURA', 'PROFUNDIDADE', 'id', 'created_at']):
            return jsonify({'error': 'Missing required form fields'}), 400

        id = data.get('id')  # Optional, if you want to allow setting ID
        modelo = data['MODELO']
        modulo = data['MODULO']
        largura = float(data['LARGURA'])
        profundidade = float(data['PROFUNDIDADE'])
        categoria = data.get('categoria', 'Geral')
        post_date = datetime.now()
        created_at = post_date.strftime('%Y-%m-%d %H:%M:%S')    

        try:
            conn = get_db()
            conn.execute('''
                INSERT INTO modules (MODELO, MODULO, LARGURA, PROFUNDIDADE, image, categoria, id, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (modelo, modulo, largura, profundidade, filename, categoria))
            conn.commit()
            conn.close()
            return jsonify({'message': 'Módulo cadastrado com sucesso!', 'filename': filename}), 201
        except sqlite3.Error as e:
            return jsonify({'error': f'Database error: {e}'}), 500
    
    return jsonify({'error': 'File type not allowed'}), 400

# Endpoint para deletar um módulo
@app.route('/api/modules/<int:module_id>', methods=['DELETE'])
def delete_module(module_id):
    try:
        conn = get_db()
        conn.execute('DELETE FROM modules WHERE id = ?', (module_id,))
        conn.commit()
        conn.close()
        return jsonify({'message': 'Módulo excluído com sucesso!'}), 200
    except sqlite3.Error as e:
        return jsonify({'error': f'Database error: {e}'}), 500
#################################
#################################

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)