import streamlit as st
import boto3
import json


# create bedrock client
bedrock = boto3.client(service_name='bedrock-runtime')
# session = boto3.Session(profile_name='defalut')
# bedrock = session.client(service_name='bedrock-runtime')

dict_lang = {
    'en': '英語',
    'ja': '日本語'
}

def generate_prompt(prompt, in_la, out_la):
    return f'<text>の{dict_lang[in_la]}を{dict_lang[out_la]}に変換してください。出力は変換後の文章もしくは単語のみすること。\n <text> {prompt} </text>'

def generate_review_prompt(prompt, senario=None):
    if senario:
        return f'<senario>を踏まえて、<text>を添削して、正しい文章を英語で出力してください。その際、修正点を日本語で解説してください。\n <senario> {senario} </senario> \n <text> {prompt} </text>'
    else:
        return f'<text>を添削して、正しい文章を英語で出力してください。その際、修正点を日本語で解説してください。\n <text> {prompt} </text>'


def initialize_session():
    # Initialize chat history
    if "messages" not in st.session_state:
        st.session_state.messages = []

    # Display chat messages from history on app rerun
    for message in st.session_state.messages:
        with st.chat_message(message["role"]):
            st.markdown(message["content"])


def chatbot(chat_input_str):
    # Accept user input
    if prompt := st.chat_input(chat_input_str):
        
        # Add user message to chat history
        st.session_state.messages.append({"role": "user", "content": prompt})
        # Display user message in chat message container
        with st.chat_message("user"):
            st.markdown(prompt)

        # Display assistant response in chat message container
        with st.chat_message("assistant"):
            message_placeholder = st.empty()
            text = ''
            stream = open_bedrock_stream(prompt)
            if stream:
                for event in stream:
                    chunk = event.get('chunk')
            
                    if chunk:
                        chunk_bytes = json.loads(chunk.get('bytes').decode())
                        if chunk_bytes['type'] == 'content_block_delta' and chunk_bytes['delta']['type'] == 'text_delta':
                            text += chunk_bytes['delta']['text']
                            message_placeholder.markdown(text)
                        else:
                            continue
                message_placeholder.markdown(text)
        # Add assistant response to chat history
        st.session_state.messages.append({"role": "assistant", "content": text})

# Model name to ID mapping
MODEL_MAPPING = {
    "Claude 3 Haiku": "anthropic.claude-3-haiku-20240307-v1:0",
    "Claude 3.5 Haiku": "anthropic.claude-3-5-haiku-20241022-v1:0",
    "Claude 3.5 Sonnet v2": "anthropic.claude-3-5-sonnet-20241022-v2:0",
    "Claude 3.7 Sonnet": "anthropic.claude-3-7-sonnet-20250219-v1:0"
}

def mock_stream_response(prompt):
    """Generate a mock stream response for testing without AWS credentials"""
    import time
    from io import StringIO
    import random
    
    # Create a simple response based on the prompt
    if "天気" in prompt:
        response = "申し訳ありませんが、現在の天気情報にはアクセスできません。これはモックモードでの応答です。実際のAPIを使用するには、AWSの認証情報を設定してください。"
    elif "translate" in prompt.lower() or "翻訳" in prompt:
        response = "This is a mock translation response. To use the actual translation service, please configure AWS credentials."
    else:
        response = f"これはモックモードでの応答です。選択されたモデル: {st.session_state.get('model_name', 'Claude 3 Haiku')}。実際のAPIを使用するには、AWSの認証情報を設定してください。"
    
    # Simulate streaming by yielding one character at a time
    class MockChunk:
        def __init__(self, text):
            self.text = text
            
    class MockEvent:
        def __init__(self, text_chunk):
            self._chunk = {"bytes": json.dumps({
                "type": "content_block_delta",
                "delta": {"type": "text_delta", "text": text_chunk}
            }).encode()}
            
        def get(self, key):
            if key == 'chunk':
                return self._chunk
    
    # Yield the response character by character with small delays
    for i in range(0, len(response), 3):
        chunk = response[i:i+3]
        yield MockEvent(chunk)
        time.sleep(0.05)  # Small delay to simulate streaming

def open_bedrock_stream(prompt):
    """Call Bedrock API or return mock response if in mock mode or if credentials are missing"""
    # Check if we're in mock mode
    if st.session_state.get('mock_mode', False):
        return mock_stream_response(prompt)
        
    body = json.dumps({
        "anthropic_version": "bedrock-2023-05-31", 
        "max_tokens": 1024,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": prompt
                    }
                ]
            }
        ]
    })            

    model_name = st.session_state.get('model_name', "Claude 3 Haiku")
    model_id = MODEL_MAPPING[model_name]
    
    try:
        response = bedrock.invoke_model_with_response_stream(modelId=model_id, body=body)
        stream = response.get('body')
        return stream
    except Exception as e:
        st.error(f"Error calling Bedrock API: {str(e)}")
        st.warning("Switching to mock mode. Configure AWS credentials to use the actual API.")
        # Automatically switch to mock mode when an error occurs
        st.session_state.mock_mode = True
        return mock_stream_response(prompt)


def new_translation():
    col1, col2 = st.columns(2)

    with col1:
        input_lang = st.selectbox('Select language', ['English', '日本語'])
        prompt = st.text_area('input', placeholder='input', height=400 ,max_chars=5000,)

    with col2:
        output_lang = st.selectbox('Select language', [' English', ' 日本語'])
        st.write('output')
        message_placeholder = st.empty()
        message_placeholder.markdown('出力表示されるよ')
    
    if input_lang == 'English':
        in_la = 'en'
    elif input_lang == '日本語':
        in_la = 'ja'

    if output_lang == ' English':
        out_la = 'en'
    elif output_lang == ' 日本語':
        out_la = 'ja'
    
    if prompt: 
        text = ''
        print(generate_prompt(prompt, in_la, out_la))
        stream = open_bedrock_stream(generate_prompt(prompt, in_la, out_la))

        if stream:
            for event in stream:
                chunk = event.get('chunk')
        
                if chunk:
                    chunk_bytes = json.loads(chunk.get('bytes').decode())
                    if chunk_bytes['type'] == 'content_block_delta' and chunk_bytes['delta']['type'] == 'text_delta':
                        text += chunk_bytes['delta']['text']
                        message_placeholder.markdown(text)
                    else:
                        continue
            message_placeholder.markdown(text)


def review():
    senario = st.text_area('senario', placeholder='senario', height=200 ,max_chars=5000,)
    input_text = st.text_area('text', placeholder='text', height=400 ,max_chars=5000,)

    message_placeholder = st.empty()
    message_placeholder.markdown('出力表示されるよ')


    if input_text: 
        text = ''
        print(generate_review_prompt(senario, input_text))
        stream = open_bedrock_stream(generate_review_prompt(senario, input_text))
        
        if stream:
            for event in stream:
                chunk = event.get('chunk')
        
                if chunk:
                    chunk_bytes = json.loads(chunk.get('bytes').decode())
                    if chunk_bytes['type'] == 'content_block_delta' and chunk_bytes['delta']['type'] == 'text_delta':
                        text += chunk_bytes['delta']['text']
                        message_placeholder.markdown(text)
                    else:
                        continue
            message_placeholder.markdown(text)



# Initialize session state variables
if 'model_name' not in st.session_state:
    st.session_state.model_name = "Claude 3 Haiku"
if 'mock_mode' not in st.session_state:
    st.session_state.mock_mode = False

# Model selection in sidebar
st.sidebar.title("Model Settings")
model_options = list(MODEL_MAPPING.keys())
selected_model = st.sidebar.selectbox(
    'Select Model',
    model_options,
    index=model_options.index(st.session_state.model_name)
)

# Mock mode toggle
mock_mode = st.sidebar.checkbox(
    'Mock Mode (No AWS credentials needed)',
    value=st.session_state.mock_mode,
    help="Enable this if you don't have AWS credentials configured. Will return mock responses."
)

# Update session state when settings change
if selected_model != st.session_state.model_name:
    st.session_state.model_name = selected_model
    st.session_state.messages = []  # Clear chat history when model changes

if mock_mode != st.session_state.mock_mode:
    st.session_state.mock_mode = mock_mode
    st.session_state.messages = []  # Clear chat history when mode changes

# Page selection
st.sidebar.title("Navigation")
page = st.sidebar.selectbox('ページを選択してください', ['Chatbot', 'Translation', 'Review'])

if page == 'Chatbot':
    st.title("Chatbot")
    st.empty()
    initialize_session()
    chatbot("問い合わせてみてください")

elif page == 'Translation':
    st.title("Translation")
    st.empty()
    new_translation()


elif page == 'Review':
    st.title("Review")
    st.empty()
    review()
