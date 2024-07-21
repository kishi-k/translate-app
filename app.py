import streamlit as st
import boto3
import json


session = boto3.Session(profile_name='defalut')
bedrock = session.client(service_name='bedrock-runtime')


def generate_prompt(prompt, la):
    if la == 'ja':
        return f'次の英語を日本語に変換してください \n {prompt}'
    elif la == 'en':
        return f'次の日本語を英語に変換してください \n {prompt}'


def initialize_session():
    # Initialize chat history
    if "messages" not in st.session_state:
        st.session_state.messages = []

    # Display chat messages from history on app rerun
    for message in st.session_state.messages:
        with st.chat_message(message["role"]):
            st.markdown(message["content"])


def translate(chat_input_str, la):
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
            body = json.dumps({
                "anthropic_version": "bedrock-2023-05-31", 
                "max_tokens": 1024,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": generate_prompt(prompt, la)
                            }
                        ]
                    }
                ]
            })            

            response = bedrock.invoke_model_with_response_stream(modelId='anthropic.claude-3-haiku-20240307-v1:0', body=body)
            stream = response.get('body')
            if stream:
                for event in stream:
                    chunk = event.get('chunk')
            
                    if chunk:
                        # 取得したチャンクをappendしてStreamlitに出力
                        chunk_bytes = json.loads(chunk.get('bytes').decode())
                        if chunk_bytes['type'] == 'content_block_delta' and chunk_bytes['delta']['type'] == 'text_delta':
                            text += chunk_bytes['delta']['text']
                            message_placeholder.markdown(text)
                        else:
                            continue
                message_placeholder.markdown(text)
        # Add assistant response to chat history
        st.session_state.messages.append({"role": "assistant", "content": text})




# サイドバーにページ選択のセレクトボックスを作成
page = st.sidebar.selectbox('ページを選択してください', ['English → 日本語', '日本語 → English'])

if page == 'English → 日本語':
    st.title("Translation Japanese")
    st.empty()
    initialize_session()
    translate("Enter the English sentense", 'ja')

elif page == "日本語 → English":
    st.title("Translation English")
    st.empty()
    initialize_session()
    translate("日本語を入力してね", 'en')


