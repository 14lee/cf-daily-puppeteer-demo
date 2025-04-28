export function useWebhook(url: string) {
  async function trigger(content: string) {
    const data = {
      msgtype: "markdown",
      markdown: {
        content: content,
      },
    };
    const requestOptions = {
      method: "POST", // 指定请求方法为 POST
      headers: {
        "Content-Type": "application/json", // 设置请求头，告诉服务器我们发送的是 JSON 数据
      },
      body: JSON.stringify(data), // 将 JavaScript 对象转换为 JSON 字符串作为请求体
    };

    const result = await fetch(url, requestOptions);
    return !!(result.status === 200);
  }

  return {
    trigger,
  };
}
