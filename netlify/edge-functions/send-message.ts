import type { Config, Context } from "https://edge.netlify.com/";
import { connect } from "https://esm.sh/@planetscale/database";
import { fetchFromGpt } from "../utils/gpt-fetch.ts";

function escapeStringForSql(str) {
  return str.replace(/'/g, "''");
}

export default async function handler(req: Request, context: Context) {
  const config = {
    host: Deno.env.get("DATABASE_HOST"),
    username: Deno.env.get("DATABASE_USERNAME"),
    password: Deno.env.get("DATABASE_PASSWORD"),
  };

  const conn = connect(config);

  const isPostingNewMessage = req.method === "POST";

  let conversationId = 1;

  if (isPostingNewMessage) {
    // get form data from request
    const formData = await req.formData();

    // get the conversation_id and message content from the form data
    conversationId = formData.get("conversationId");
    const newMessageContent = formData.get("newMessageContent");

    await conn.execute(`INSERT INTO messages (type, conversation_id, content)
  VALUES ('user', ${conversationId}, '${escapeStringForSql(
      newMessageContent
    )}');`);
  }

  const conversation = await conn
    .execute(`SELECT * from conversations WHERE id = ${conversationId}`)
    .then((result) => result.rows[0]);

  // write SQL that will get the system prompt for the conversation above
  const systemPrompt = await conn
    .execute(
      `SELECT * from system_prompts WHERE id = ${conversation.system_prompt_id}`
    )
    .then((result) => result.rows[0].content);

  // write SQL that will get all the rows for the conversation above
  let messages = await conn
    .execute(
      `SELECT * from messages WHERE conversation_id = ${conversation.id}`
    )
    .then((result) => result.rows);

  if (isPostingNewMessage) {
    const messageFromGpt = await fetchFromGpt(systemPrompt, messages);

    await conn.execute(`INSERT INTO messages (type, conversation_id, content)
    VALUES ('assistant', ${conversation.id}, '${escapeStringForSql(
      messageFromGpt.content
    )}');`);

    // refetch messages from the database
    messages = await conn
      .execute(
        `SELECT * from messages WHERE conversation_id = ${conversation.id}`
      )
      .then((result) => result.rows);
  }

  const html = renderHtml(messages);

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=UTF-8",
    },
  });
}

function renderHtml(messages) {
  return `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Chat with GPT-3</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/bulma/0.9.1/css/bulma.min.css">
  </head>
  <body>
    <section class="section">
      <div class="container">
        <h1 class="title">Chat with GPT-3</h1>
        <div class="box">
          <div class="content">
            <ul>
              ${messages
                .map((message) => {
                  return `
                    <li>
                      <strong>${
                        message.type
                      }:</strong> ${message.content.replaceAll("\n", "<br>")}
                    </li>
                  `;
                })
                .join("")}
            </ul>
          </div>
        </div>
        <form action="/send-message" method="POST">
          <input type="hidden" name="conversationId" value="1">
          <div class="field">
            <label class="label">Message</label>
            <div class="control">
              <input class="input" type="text" name="newMessageContent">
            </div>  
          </div>
          <div class="field">
            <div class="control">
              <button class="button is-link">Send</button>
            </div>  
          </div>
          </form>
      </div>
    </section>
  </body>
</html>
`;
}

export const config: Config = {
  path: "/send-message",
};
