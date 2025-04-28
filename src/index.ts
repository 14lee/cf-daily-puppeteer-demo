import { useWebhook } from './use-webhook'
import puppeteer from '@cloudflare/puppeteer';

interface Env {
  BROWSER: any;
  ACCOUNT_ID: string;
  API_TOKEN: string;
	AI: Ai;
	WRANGLER_WEB_HOOK_URL: string;
	WRANGLER_PAGE_URL: string;
}

async function scrapeLastLoopblk(url: string, _browser: any) {
  const browser = await puppeteer.launch(_browser);

  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

    // 等待页面中的 loopblk 元素加载完成
    await page.waitForSelector(".loopblk");

    const lastLoopblkData = await page.evaluate(() => {
			const loopblks = (document as any).querySelectorAll(".loopblk");
			if (loopblks.length === 0) return null;
			const lastLoopblk = loopblks[loopblks.length - 1];
			const table =
				lastLoopblk.querySelector("#Con11 > table") ||
				lastLoopblk.querySelector("table");
			if (!table) {
				return {
					content: lastLoopblk.innerHTML,
					text: lastLoopblk.innerText,
				};
			}
			const headers = Array.from(table.querySelectorAll("th")).map((th) =>
				th.innerText.trim()
			);
			const rows = Array.from(table.querySelectorAll("tr")).slice(1);
			// 只保留带链接的单元格数据
			const filteredData = rows
				.map((row) => {
					const cells = Array.from(row.querySelectorAll("td"));
					const rowData = {};
					headers.forEach((header, index) => {
						const cell = cells[index];
						if (!cell) return;
						const link = cell.querySelector("a");
						if (link) {
							rowData[header] = {
								text: link.innerText.trim(),
								url: link.href,
								hasLink: true,
							};
						}
					});
					return rowData;
				})
				.filter((row) => Object.keys(row).length > 0);
			// 保留有链接内容的列头
			const filteredHeaders = headers.filter((header) =>
				filteredData.some((row) => row.hasOwnProperty(header))
			);
			return {
				headers: filteredHeaders,
				data: filteredData,
			};
		});

    return lastLoopblkData;
  } finally {
    await browser.close();
  }
}

async function getLLMResult(env: Env,) {
  const model = "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b"
	const messages = [
		{ role: "system", content: `You are a JSON and Markdown expert, convert the JSON table information provided by the user into Markdown table format.
				Do not include any other content besides the markdown table content.
				example start
				json table data input:
				{
					"element": "lastLoopblk",
					"headers": [
						"序号",
						"新闻标题",
						"媒体",
						"时间"
					],
					"data": [
						{
							"序号": "1",
							"新闻标题": {
								"text": "陈奕天《花椒是狗》什么时候能上",
								"url": "https://k.sina.com.cn/article_2716484561_a1ea43d1001017x2m.html",
								"hasLink": true
							},
							"媒体": "陈奕天全球后援会",
							"时间": "04-27 14:15"
						},
					]
				}

				markdown table output:
				'##### [陈奕天《花椒是狗》什么时候能上](https://k.sina.com.cn/article_2716484561_a1ea43d1001017x2m.html)'
				example end

				only markdown
			` },
		{
			role: "user",
			content: "Help me convert JSON table data into Markdown table format",
		},
	]
	const response = await env.AI.run(model, { messages });

	console.log(response);
}


export default {
	async fetch(request, env, ctx): Promise<Response> {
		try {
			const tableData = await scrapeLastLoopblk(env.WRANGLER_PAGE_URL, env.BROWSER);

			// const model = "@cf/meta/llama-3.3-70b-instruct-fp8-fast"
			// const messages = [
			// 	{ role: "system", content: `You are a JSON and Markdown expert, convert the JSON table information provided by the user into Markdown table format.
			// 			Do not include any other content besides the markdown content.
			// 			example start
			// 			json table data input:
			// 			"# [陈奕天《花椒是狗》什么时候能上](https://k.sina.com.cn/article_2716484561_a1ea43d1001017x2m.html)"

			// 			markdown format output:
			// 			# [陈奕天《花椒是狗》什么时候能上](https://k.sina.com.cn/article_2716484561_a1ea43d1001017x2m.html)
			// 			example end

			// 			only markdown
			// 		` },
			// 	{
			// 		role: "user",
			// 		content: JSON.stringify(tableData),
			// 	},
			// ]
			// const response = await env.AI.run(model, { messages });
			// const result = response?.response

			const allLinks = tableData?.data?.map((item: any) => `##### [${item['新闻标题'].text}](${item['新闻标题'].url})`);
			const markdownFormat = '# <font color="info">每日娱乐新闻</font> \n' + allLinks?.reduce((p, n) => p + n + '\n', '') || '';
			const { trigger } = useWebhook(env.WRANGLER_WEB_HOOK_URL);

			await trigger(markdownFormat)

			return new Response("成功");
		} catch (error) {
			return new Response('抓取过程出错' + error,);
		}
	},
} satisfies ExportedHandler<Env>;
