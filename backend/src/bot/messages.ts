export const textMessage = (body: string) => ({
  type: "text",
  text: { body },
});

export const welcomeButtons = () => ({
  type: "interactive",
  interactive: {
    type: "button",
    body: { text: "Hola. En que te ayudamos hoy?" },
    action: {
      buttons: [
        { type: "reply", reply: { id: "ver_productos", title: "Ver productos" } },
        { type: "reply", reply: { id: "hacer_pedido", title: "Hacer pedido" } },
        { type: "reply", reply: { id: "soporte", title: "Soporte" } },
      ],
    },
  },
});
