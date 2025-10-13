import { getAdmin } from "./admin";

export const sendPN = (isProvider, message) => {
  getAdmin(isProvider)
    .messaging()
    .send(message)
    .then((response) => {
      // Response is a message ID string.
      console.log("Successfully sent message:", response);
    })
    .catch((error) => {
      console.log("Error sending message:", error);
    });
};
