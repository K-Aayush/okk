import {
  Note,
  Careplan,
  CareplanAlerts,
  Invite,
  ProviderPractice,
  User,
  Specialty,
  DirectMessageInboxItem,
} from "../db";
import {
  checkPhoneVerficationRequestPromise,
  requestVerification,
} from "../services/twilio";

const fetchNewInviteCount = async (user) => {
  const individualInviteCount = await Invite.countDocuments({
    invitee: user._id,
  });
  let adminPracticesTotalReceived = 0;
  if (user.activeProviderPractice?.isAdmin) {
    const practiceInvites = await ProviderPractice.aggregate([
      {
        $match: {
          user: user._id,
          isAdmin: true,
        },
      },
      {
        $lookup: {
          from: "invites",
          let: { practice: "$practice" },
          as: "invites",
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ["$$practice", "$practice"],
                },
              },
            },
            {
              $group: {
                _id: null,
                received: {
                  $sum: { $cond: [{ $ifNull: ["$invitee", false] }, 0, 1] },
                },
                sent: {
                  $sum: { $cond: [{ $ifNull: ["$invitee", false] }, 1, 0] },
                },
              },
            },
          ],
        },
      },
      {
        $lookup: {
          from: "practices",
          localField: "practice",
          foreignField: "_id",
          as: "practice",
        },
      },
      {
        $unwind: "$practice",
      },
      {
        $project: {
          practice: 1,
          totalReceived: {
            $ifNull: [{ $first: "$invites.received" }, 0],
          },
          totalSent: {
            $ifNull: [{ $first: "$invites.sent" }, 0],
          },
        },
      },
    ]);

    adminPracticesTotalReceived = practiceInvites?.reduce(
      (acc, cur) => acc + cur.totalReceived,
      0
    );
  }
  return {
    individualInviteCount,
    practiceInviteCount: adminPracticesTotalReceived,
  };
};

const fetchNewReportCount = async (userId) => {
  return 0;
};

const fetchNewNoteCount = async (user) => {
  const conditions = { seen: { $ne: user._id }, isDraft: false };
  if (user.role === "provider") {
    conditions["$or"] = [
      {
        "shares.with":
          user.activeProviderPractice?._id || user.activeProviderPractice,
      },
    ];
  } else {
    conditions.user = user._id;
  }
  return await Note.countDocuments(conditions);
};

const fetchNewCareplanCount = async (user) => {
  const conditions = { seen: { $ne: user._id }, isActive: true };
  if (user.role === "provider") {
    conditions["$or"] = [
      {
        "shares.with":
          user.activeProviderPractice?._id || user.activeProviderPractice,
      },
    ];
  } else {
    conditions.user = user._id;
  }
  return await Careplan.countDocuments(conditions);
};

const fetchNewCoordinateCount = async (user) => {
  if (user.role !== "provider") {
    return 0;
  }

  if (
    user.activeProviderPractice?.practice?.isGazuntitePractice &&
    user.specialty !== "PCP"
  ) {
    let newCount = await Note.countDocuments({
      creator: {
        $ne: user.activeProviderPractice?._id || user.activeProviderPractice,
      },
      "shares.with":
        user.activeProviderPractice?._id || user.activeProviderPractice,
      seen: { $ne: user._id },
    });
    newCount += await Careplan.countDocuments({
      creator: {
        $ne: user.activeProviderPractice?._id || user.activeProviderPractice,
      },
      "shares.with":
        user.activeProviderPractice?._id || user.activeProviderPractice,
      seen: { $ne: user._id },
    });
    const conditions = { note: null };
    if (user.specialty && !user.activeProviderPractice.disableTracking) {
      if (user.specialty === "Cardiologist") {
        conditions.specialty = { $in: ["Cardiologist", "E-Consult"] };
      } else {
        conditions.specialty = user.specialty;
      }
    }
    const aggregate = [
      {
        $match: conditions,
      },
      {
        $lookup: {
          from: "providerpractices",
          localField: "practice",
          foreignField: "practice",
          as: "providerpractices",
        },
      },
      {
        $match: {
          providerpractices: {
            $elemMatch: {
              user: user._id,
              isLicensed: true,
              deactivated: { $ne: true },
            },
          },
        },
      },
    ];
    const docs = await DirectMessageInboxItem.aggregate(aggregate);
    newCount += docs.length;
    return newCount;
  }
  const newCount = await Note.countDocuments({
    creator: {
      $ne: user.activeProviderPractice?._id || user.activeProviderPractice,
    },
    isDraft: false,
    signDate: { $exists: true },
    $or: [
      {
        "shares.with":
          user.activeProviderPractice?._id || user.activeProviderPractice,
      },
      {
        "directMessageShare.to":
          user.activeProviderPractice?._id || user.activeProviderPractice,
      },
    ],
    seen: { $ne: user._id },
  });
  return newCount;
};

const fetchNewCallCount = async (userId) => {
  return 0;
};

const fetchNewAlertCount = async (userId, isProvider) => {
  const conditions = { seen: { $ne: userId } };
  if (isProvider) {
    conditions.providers = userId;
  } else {
    conditions.user = userId;
  }
  return await CareplanAlerts.countDocuments(conditions);
};

const fetchNewPrescribeCount = async (userId) => {
  return 0;
};

export default [
  {
    key: "user",
    prototype: "(id: String!): User",
    run: async ({ id }) => {
      const user = await User.findById(id).populate({
        path: "activeProviderPractice",
        populate: "practice",
      });

      return user;
    },
  },
  {
    key: "phoneVerifyStatus",
    prototype: ": PhoneVerifyStatus",
    run: async ({}, { user }) => {
      const phones = user.phones;
      const verifyStatus = {
        mobile: false,
        work: false,
        home: false,
      };
      const checkVerificationRequestPromises = [];
      Object.keys(verifyStatus).forEach((type) => {
        const number =
          type !== "work"
            ? phones[type]
            : user.activeProviderPractice.practice.phone;
        if (!number) {
          return;
        }
        checkVerificationRequestPromises.push(
          new Promise((resolve, reject) => {
            checkPhoneVerficationRequestPromise(number).then((verified) => {
              verifyStatus[type] = verified;
              resolve();
            });
          })
        );
      });
      await Promise.all(checkVerificationRequestPromises);
      return verifyStatus;
    },
  },
  {
    key: "initVerifyNumber",
    prototype: "(number: String!): String",
    mutation: true,
    run: async ({ number }, { user }) => {
      const result = await requestVerification(number);
      return result?.validationCode;
    },
  },
  {
    key: "updateCallMasking",
    prototype: "(masking: String!): User",
    mutation: true,
    run: async ({ masking }, { user }) => {
      const updated = await User.findByIdAndUpdate(
        user._id,
        {
          phones: {
            ...user.phones,
            masking: masking !== "off" ? masking : null,
          },
        },
        { new: true }
      );
      return updated;
    },
  },
  {
    key: "saveRecentPatients",
    prototype: "(recentPatients: [String!]): [User]",
    mutation: true,
    run: async ({ recentPatients }, { user }) => {
      await User.findByIdAndUpdate(user._id, {
        recentPatients: recentPatients,
      });

      const option = {
        _id: { $in: recentPatients },
      };

      return await User.find(option)
        .select(`_id firstName lastName email photo`)
        .lean();
    },
  },
  {
    key: "recentPatients",
    prototype: ": [User]",
    run: async ({}, { user }) => {
      const patientIds = await User.findOne({ _id: user._id }, { _id: false })
        .select("recentPatients")
        .exec();

      const option = {
        _id: { $in: patientIds?.recentPatients },
      };

      return await User.find(option)
        .select(`_id firstName lastName email photo`)
        .lean();
    },
  },
  {
    key: "allNewItemsCount",
    prototype: ": UserNewItemsCount",
    run: async ({}, { user }) => {
      const itemCounts = {};
      await Promise.all([
        new Promise(async (resolve) => {
          try {
            itemCounts.invite = await fetchNewInviteCount(user);
          } catch (error) {
            itemCounts.invite = 0;
          }
          resolve();
        }),
        new Promise(async (resolve) => {
          try {
            itemCounts.report = await fetchNewReportCount(user._id);
          } catch (error) {
            itemCounts.report = 0;
          }
          resolve();
        }),
        new Promise(async (resolve) => {
          try {
            itemCounts.note = await fetchNewNoteCount(user);
          } catch (error) {
            itemCounts.note = 0;
          }
          resolve();
        }),
        new Promise(async (resolve) => {
          try {
            itemCounts.careplan = await fetchNewCareplanCount(user);
          } catch (error) {
            itemCounts.careplan = 0;
          }
          resolve();
        }),
        new Promise(async (resolve) => {
          try {
            itemCounts.coordinate = await fetchNewCoordinateCount(user);
          } catch (error) {
            itemCounts.coordinate = 0;
          }
          resolve();
        }),
        new Promise(async (resolve) => {
          try {
            itemCounts.call = await fetchNewCallCount(user._id);
          } catch (error) {
            itemCounts.call = 0;
          }
          resolve();
        }),
        new Promise(async (resolve) => {
          try {
            itemCounts.alert = await fetchNewAlertCount(
              user._id,
              user.role === "provider"
            );
          } catch (error) {
            itemCounts.alert = 0;
          }
          resolve();
        }),
        new Promise(async (resolve) => {
          try {
            itemCounts.prescribe = await fetchNewPrescribeCount(user._id);
          } catch (error) {
            itemCounts.prescribe = 0;
          }
          resolve();
        }),
      ]);
      return itemCounts;
    },
  },
  {
    key: "inviteCount",
    prototype: ": InviteCount!",
    run: async ({}, { user }) => {
      return await fetchNewInviteCount(user);
    },
  },
  {
    key: "reportCount",
    prototype: ": Int",
    run: async ({}, { user }) => {
      return await fetchNewReportCount(user._id);
    },
  },
  {
    key: "noteCount",
    prototype: ": Int",
    run: async ({}, { user }) => {
      return await fetchNewNoteCount(user);
    },
  },
  {
    key: "careplanCount",
    prototype: ": Int",
    run: async ({}, { user }) => {
      return await fetchNewCareplanCount(user);
    },
  },
  {
    key: "coordinateCount",
    prototype: ": Int",
    run: async ({}, { user }) => {
      return await fetchNewCoordinateCount(user);
    },
  },
  {
    key: "callCount",
    prototype: ": Int",
    run: async ({}, { user }) => {
      return await fetchNewCallCount(user._id);
    },
  },
  {
    key: "alertCount",
    prototype: ": Int",
    run: async ({}, { user }) => {
      return await fetchNewAlertCount(user._id, user.role === "provider");
    },
  },
  {
    key: "prescribeCount",
    prototype: ": Int",
    run: async ({}, { user }) => {
      return await fetchNewPrescribeCount(user._id);
    },
  },
  {
    key: "updateBilling",
    prototype: "(time: Int!, therapeutic: Int!, physiologic: Int!): Boolean",
    mutation: true,
    run: async ({ time, therapeutic, physiologic }, { user }) => {
      if (user.role !== "provider") {
        return false;
      }
      await ProviderPractice.update(
        { _id: user.activeProviderPractice },
        { billing: { time, therapeutic, physiologic } }
      );

      return true;
    },
  },
  {
    key: "specialties",
    prototype: ":[String!]",
    isPublic: true,
    run: async () => {
      const specialties = await Specialty.find().lean();
      return specialties.map((specialty) => specialty.title);
    },
  },
  {
    key: "updateSpecialty",
    prototype: "(specialty: String!): AuthUser!",
    mutation: true,
    run: async ({ specialty }, { user }) => {
      if (user.role !== "provider") {
        throw new Error("Only providers can update their specialty");
      }
      const updatedUser = await User.findByIdAndUpdate(user._id, { specialty });
      return updatedUser;
    },
  },
  {
    key: "userSignature",
    prototype: ": UserSignature",
    run: async ({}, { user }) => {
      if (user.role !== "provider") {
        return { saveSignature: false, signature: null };
      }

      if (!user.signatureImage) {
        return { saveSignature: false, signature: null };
      }

      try {
        return {
          saveSignature: true,
          signature: user.signatureImage,
        };
      } catch (error) {
        return { saveSignature: false, signature: null };
      }
    },
  },
  {
    key: "createUser",
    prototype:
      "(email: String!, password: String!, firstName: String!, lastName: String!): User",
    mutation: true,
    run: async ({ email, password, firstName, lastName }) => {
      const newUser = new User({
        email,
        password,
        firstName,
        lastName,
      });
      await newUser.save();
      return newUser;
    },
  },
];
