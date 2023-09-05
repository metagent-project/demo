import openai
import tiktoken
from typedefs import *


class ChatGPT:
    model = "gpt-4"
    max_tokens = 16384 // 2
    token_headroom = 1000
    max_retries = 3
    request_timeout = 30
    DEBUG = False

    def shorten_prompt(self, messages):
        encoding = tiktoken.get_encoding("cl100k_base")
        try:
            all_contents = '\n'.join([ msg['content'] for msg in messages ])
        except:
            print(PrintColors.RED + "Wrong message format in OpenAI call: " + PrintColors.END + str(messages))

        num_tokens = len(encoding.encode(all_contents))
        max_prompt_tokens = self.max_tokens - self.token_headroom
        if num_tokens <= max_prompt_tokens:
            return messages
        token_overage = num_tokens - max_prompt_tokens

        remove_done = False
        new_messages = []
        for msg in messages:
            if remove_done:
                new_messages.append(msg)
            # remove the first user messages that exceeds token limit
            if msg['role'] == 'user':
                num_tokens = len(encoding.encode(msg['content']))
                token_overage -= num_tokens
                if token_overage <= 0:
                    remove_done = True
            else:  # do not remove system messages
                new_messages.append(msg)
        return new_messages

    async def get_completion(self, messages):
        if self.DEBUG:
            print(messages)
        messages = self.shorten_prompt(messages)
        num_retries = 0
        while num_retries < self.max_retries:
            try:
                completion = await openai.ChatCompletion.acreate(
                    model=self.model,
                    messages=messages,
                    request_timeout=self.request_timeout
                )
                if self.DEBUG:
                    print(completion["choices"][0]["message"]["content"])
                return completion["choices"][0]["message"]["content"]
            except openai.error.OpenAIError:
                import time
                time.sleep(5)
            except Exception as e:
                num_retries += 1
                print(PrintColors.RED + str(e) + PrintColors.END)
        return ""

    async def get_completion_stream(self, messages):
        if self.DEBUG:
            print(messages)
        messages = self.shorten_prompt(messages)
        num_retries = 0
        while num_retries < self.max_retries:
            try:
                stream = await openai.ChatCompletion.acreate(
                    model=self.model,
                    messages=messages,
                    stream=True,
                    request_timeout=self.request_timeout,
                )
                async for chunk in stream:
                    content = chunk["choices"][0].get("delta", {}).get("content")
                    if content is not None:
                        yield content
                return
            except openai.error.OpenAIError:
                import time
                time.sleep(5)
            except Exception as e:
                num_retries += 1
                print(PrintColors.RED + str(e) + PrintColors.END)
        return