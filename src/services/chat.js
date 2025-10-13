import _ from 'lodash';
import uniq from 'lodash/uniq';

import { Chat, ChatMessage, ChatMember, User } from '../db';
import { buildPracticeUrlForUser, equalId, populateProvider } from '../utils';
import socketManager from './socket-manager';
import { sendMessageEmail } from './mailer';
import { sendMessageSMS } from './twilio';
import SOCKET_EVENTS from './socket-manager/constants';

export const getChatRoom = async (memberIds, referredPatientId, group) => {
  const dedupedMemberIds = uniq(memberIds);

  let room = await Chat.findOne({
    $and: [
      {
        members: {
          $all: dedupedMemberIds,
        },
      },
      {
        members: {
          $size: dedupedMemberIds.length,
        },
      },
      { referredPatient: referredPatientId },
    ],
  }).exec();

  if (!room) {
    room = await Chat.create({
      members: dedupedMemberIds,
      referredPatient: referredPatientId,
      group,
    });
  }

  await room
    .populate([populateProvider('members'), 'referredPatient'])
    .execPopulate();
  return room;
};

export const readChat = async (user, chatId) => {
  await ChatMember.findOneAndUpdate(
    {
      chat: chatId,
      member: user?._id || user,
    },
    {
      lastReadAt: new Date(),
    },
    {
      upsert: true,
    }
  );
};

export const sendChat = async (user, data) => {
  const chatObject = await ChatMessage.create({
    chat: data.chatId,
    text: data.text,
    attachment: data.attachment,
    note: data.note?._id || data.note,
    careplan: data.careplan?._id || data.careplan,
    sender: user,
  });

  await readChat(user, data.chatId);

  const allMemberIds = [...data.memberIds];
  allMemberIds.push(user._id);

  const chatMessage = {
    ...chatObject.toObject(),
    note: data.note,
    careplan: data.careplan,
  };

  allMemberIds.forEach((uId) => {
    socketManager.sendMessage(
      uId,
      SOCKET_EVENTS.CHAT,
      _.pick(chatMessage, [
        '_id',
        'chat',
        'sender',
        'text',
        'attachment',
        'note',
        'careplan',
        'createdAt',
        'updatedAt',
      ])
    );
  });

  const proms = data.memberIds.map((uId) => User.findById(uId));
  const recipients = await Promise.all(proms);
  const senderLabel =
    `${user.firstName} ${user.lastName}` +
    (user.role === 'provider' ? ` (${user.memberDesignation})` : '');
  const header = 'Gazuntite Message';
  const subject = `${senderLabel} via Gazuntite`;
  const body = `You have an unread message from ${senderLabel}`;

  recipients.forEach(async (member) => {
    const urlMemberIds = allMemberIds.filter((id) => !equalId(id, member._id));
    const url = new URLSearchParams();
    urlMemberIds.forEach((mId) => {
      url.append('memberIds', mId);
    });
    if (data.referredPatientId) {
      url.append('referredPatientId', data.referredPatientId);
    }
    const portalUrl = await buildPracticeUrlForUser(`/chat?${url}`, member);

    if (member.email && member.role !== 'patient') {
      //disable for patient
      sendMessageEmail(member.email, {
        subject,
        header,
        body,
        portalUrl,
      });
    }

    const phone = member.phones[member.phones.preference || 'mobile'];
    //disable for patient
    if (phone && member.role !== 'patient') {
      sendMessageSMS(phone, { header, body, portalUrl });
    }
  });
};
