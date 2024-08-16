import streamlit as st
import boto3
import json


session = boto3.Session(profile_name='defalut')
bedrock = session.client(service_name='bedrock-runtime')

dict_lang = {
    'en': '英語',
    'ja': '日本語'
}

def generate_prompt(prompt, in_la, out_la):
    return f'<text>の{dict_lang[in_la]}を{dict_lang[out_la]}に変換してください。出力は変換後の文章もしくは単語のみすること。\n <text> {prompt} </text>'

def generate_review_prompt(senario, prompt):
    return f'<senario>を踏まえて、<text>を添削して、正しい文章を英語で出力してください。その際、修正点を日本語で解説してください。\n <senario> {senario} </senario> \n <text> {prompt} </text>'


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

def open_bedrock_stream(prompt):
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

    response = bedrock.invoke_model_with_response_stream(modelId='anthropic.claude-3-haiku-20240307-v1:0', body=body)
    stream = response.get('body')

    return stream


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
    input_text = st.text_area('text', placeholder='senario', height=400 ,max_chars=5000,)

    message_placeholder = st.empty()
    message_placeholder.markdown('出力表示されるよ')


    if senario and input_text: 
        text = ''
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

        


