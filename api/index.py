from flask import Flask, request, jsonify, render_template, send_from_directory
from flask_cors import CORS
import google.generativeai as genai
import json
import re
import os
import tempfile
from TTS.api import TTS  # Coqui TTS

app = Flask(__name__)
CORS(app)

# Gemini api
GEMINI_API_KEY = "AIzaSyCAd_Tv_IwiyNNI33Tu6wOk39dbNl6AhLY"  
genai.configure(api_key=GEMINI_API_KEY)

class MindmapGenerator:
    def __init__(self):
        self.gemini_model = genai.GenerativeModel('gemini-2.0-flash')
    
    def generate_mindmap_json(self, text):
        """Sử dụng Gemini API để tạo JSON sơ đồ tư duy"""
        mindmap_schema = """{
  "central_topic": "string",
  "branches": [
    {
      "label": "string",
      "source_text": "string",
      "children": [
        {
          "label": "string",
          "source_text": "string",
          "children": [ ... ] //optional, for deeper levels
        }
      ]
    }
  ]
}"""

        prompt  = f"""Hãy đọc đoạn văn sau và tạo một sơ đồ tư duy có cấu trúc trung tâm tỏa nhánh để trực quan hóa nội dung, phù hợp với người mắc chứng khó đọc.\n\nText:\n{text}\n\nYêu cầu:\n- Chủ đề trung tâm: Sử dụng từ khóa quan trọng nhất làm chủ đề trung tâm.\n- Nhánh chính: Mỗi nhánh đại diện cho một khái niệm chính từ văn bản, chỉ dùng một từ khóa.\n- Nhánh phụ: Mở rộng mỗi khái niệm chính bằng từ khóa ngắn gọn, rõ ràng, tránh cụm từ dài.\n- Cấu trúc phân cấp: Đảm bảo cấu trúc logic rõ ràng, giúp dễ hiểu mối quan hệ giữa các ý tưởng.\n- Tính phù hợp: Giữ nội dung tối giản để hỗ trợ người mắc chứng khó đọc.\n- QUAN TRỌNG: Hãy tách văn bản đầu vào thành các đoạn (câu hoặc đoạn ngắn liên tiếp, không bỏ sót bất kỳ đoạn nào). Mỗi đoạn này phải được gán vào một node trong mindmap (có thể là node chính hoặc node phụ tuỳ cấu trúc).\n- Trường \"source_text\" của mỗi node phải là một đoạn văn bản gốc, không được tóm tắt, rút gọn, bỏ sót hay thay đổi nội dung.\n- Khi ghép lại các \"source_text\" của các node theo thứ tự duyệt cây (từ trái sang phải, từ trên xuống dưới), phải ra đúng toàn bộ văn bản đầu vào, không thiếu đoạn nào.\n\nĐịnh dạng trả về: Sơ đồ tư duy phải được cấu trúc theo JSON schema sau:\nChỉ trả về JSON hợp lệ mà không có Markdown hoặc văn bản bổ sung.\n\n{mindmap_schema}"""

        try:
            response = self.gemini_model.generate_content(prompt)
            response_text = response.text.strip()
            # Xử lý và làm sạch response để lấy JSON
            json_data = self.clean_and_parse_json(response_text)
            return json_data
        except Exception as e:
            print(f"Error with Gemini API: {e}")
            return None
    
    def clean_and_parse_json(self, response_text):
        """Làm sạch và parse JSON từ response"""
        try:
            # Loại bỏ markdown code blocks
            response_text = re.sub(r'```json\s*', '', response_text)
            response_text = re.sub(r'```\s*', '', response_text)
            # Loại bỏ text thừa trước và sau JSON
            json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
            if json_match:
                json_str = json_match.group()
                return json.loads(json_str)
            else:
                return json.loads(response_text)
        except json.JSONDecodeError as e:
            print(f"JSON parse error: {e}")
            print(f"Response text: {response_text}")
            return None
        
class TextToSpeech:
    def __init__(self):
        self.temp_dir = tempfile.mkdtemp()
        # Model tiếng Anh phổ biến của Coqui TTS
        self.tts = TTS(model_name="tts_models/en/ljspeech/tacotron2-DDC", progress_bar=False, gpu=False)
    
    def text_to_speech(self, text, filename="summary.wav"):
        """Chuyển văn bản thành giọng nói bằng Coqui TTS"""
        try:
            filepath = os.path.join(self.temp_dir, filename)
            self.tts.tts_to_file(text=text, file_path=filepath)
            return filepath
        except Exception as e:
            print(f"Error in text to speech: {e}")
            return None

# Khởi tạo các class
mindmap_gen = MindmapGenerator()
tts = TextToSpeech()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/process_text', methods=['POST'])
def process_text():
    """API endpoint xử lý văn bản"""
    try:
        data = request.json
        input_text = data.get('text', '')
        if not input_text:
            return jsonify({'error': 'Không có văn bản đầu vào'}), 400
        # tạo sơ đồ tư duy từ Gemini
        mindmap_data = mindmap_gen.generate_mindmap_json(input_text)
        if not mindmap_data:
            return jsonify({'error': 'Không thể tạo sơ đồ tư duy'}), 500
        # Tạo file tts
        audio_path = tts.text_to_speech(input_text, filename="summary.wav")
        audio_filename = None
        if audio_path:
            audio_filename = os.path.basename(audio_path)
        response_data = {
            'mindmap': mindmap_data,
            'summary': input_text,
            'audio_file': audio_filename
        }
        return jsonify(response_data)
    except Exception as e:
        print(f"Error processing text: {e}")
        return jsonify({'error': 'Lỗi xử lý văn bản'}), 500

@app.route('/audio/<filename>')
def get_audio(filename):
    """Serve audio files"""
    return send_from_directory(tts.temp_dir, filename)

# if __name__ == '__main__':
#     app.run(debug=True, port=5000) 