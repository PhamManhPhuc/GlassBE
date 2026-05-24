import { where } from "sequelize";
import db from "../models";
import bcrypt from "bcryptjs";
import user from "../models/user";
import emailService from "./emailService";

var jwt = require("jsonwebtoken");

let getUsers = () => {
  return new Promise(async (resolve, reject) => {
    try {
      let users = await db.User.findAll({
        attributes: { exclude: ["password_hash"] },
        order: [["id", "ASC"]],
      });
      resolve(users);
    } catch (e) {
      reject(e);
    }
  });
};

let deleteUser = (id) => {
  return new Promise(async (resolve, reject) => {
    try {
      let user = await db.User.findOne({ where: { id } });
      if (!user) {
        resolve({ errCode: 1, errMessage: "User not found" });
        return;
      }
      if (user.role_id === 1) {
        resolve({ errCode: 2, errMessage: "Cannot delete admin accounts" });
        return;
      }

      // Delete related data to avoid FK constraint failures
      await db.Favorite.destroy({ where: { user_id: id } });
      await db.Review.destroy({ where: { user_id: id } });

      // Cart items → cart
      const cart = await db.Cart.findOne({ where: { user_id: id } });
      if (cart) {
        await db.CartItem.destroy({ where: { cart_id: cart.id } });
        await db.Cart.destroy({ where: { id: cart.id } });
      }

      // Order items → orders
      const orders = await db.Order.findAll({ where: { user_id: id } });
      for (const order of orders) {
        await db.OrderItem.destroy({ where: { order_id: order.id } });
      }
      await db.Order.destroy({ where: { user_id: id } });

      await user.destroy();
      resolve({ errCode: 0, errMessage: "User deleted successfully" });
    } catch (e) {
      reject(e);
    }
  });
};

let getUserById = (id) => {
  return new Promise(async (resolve, reject) => {
    try {
      let user = await db.User.findOne({
        where: { id: id },
        attributes: { exclude: ["password_hash"] },
      });
      if (user) {
        resolve(user);
      } else {
        resolve(null);
      }
    } catch (e) {
      reject(e);
    }
  });
};

let handleUserLogin = (email, password) => {
  return new Promise(async (resolve, reject) => {
    try {
      let userData = {};
      let isExist = await checkUserEmail(email);
      if (isExist) {
        let user = await db.User.findOne({
          attributes: ["id", "fullname", "email", "role_id", "password_hash"],
          where: { email: email },
          raw: true,
        });

        if (user) {
          let check = await bcrypt.compareSync(password, user.password_hash);
          if (check) {
            const payload = {
              userId: user.id,
              email: user.email,
            };
            const token = jwt.sign(payload, "MY_SECRET_KEY", {
              expiresIn: "1d",
            });

            userData.errCode = 0;
            userData.errMessage = "OK";
            delete user.password_hash;
            userData.user = user;
            userData.token = token;
          } else {
            userData.errCode = 3;
            userData.errMessage = "Wrong password";
          }
        } else {
          userData.errCode = 2;
          userData.errMessage = "User not found";
        }
      } else {
        userData.errCode = 1;
        userData.errMessage = "Your email is not in the system";
      }

      resolve(userData);
    } catch (e) {
      reject(e);
    }
  });
};

let hanbleUserRegister = (email, password, fullname) => {
  return new Promise(async (resolve, reject) => {
    try {
      let isExist = await checkUserEmail(email);
      if (isExist) {
        resolve({
          errCode: 1,
          errMessage: "Your email is already in used, please try another email",
        });
      } else {
        let hashPasswordFromBcrypt = await bcrypt.hashSync(password, 10);
        let newUser = await db.User.create({
          email: email,
          password_hash: hashPasswordFromBcrypt,
          fullname: fullname,
          role_id: "2",
        });

        resolve({
          errCode: 0,
          errMessage: "OK",
          user: { id: newUser.id, email: email, fullname: fullname },
        });
      }
    } catch (e) {
      reject(e);
    }
  });
};

let checkUserEmail = (email) => {
  return new Promise(async (resolve, reject) => {
    try {
      let user = await db.User.findOne({
        where: { email: email },
      });
      if (user) {
        resolve(true);
      } else {
        resolve(false);
      }
    } catch (e) {
      reject(e);
    }
  });
};

let updateUser = (id, data) => {
  return new Promise(async (resolve, reject) => {
    try {
      let user = await db.User.findOne({
        where: { id: id },
      });
      if (user) {
        user.fullname = data.fullname;
        user.email = data.email;
        await user.save();
        resolve(user);
      } else {
        resolve(null);
      }
    } catch (e) {
      reject(e);
    }
  });
};

let updateUserPassword = (id, password) => {
  return new Promise(async (resolve, reject) => {
    try {
      let user = await db.User.findOne({
        where: { id: id },
      });
      if (user) {
        let hashPasswordFromBcrypt = await bcrypt.hashSync(password, 10);
        user.password_hash = hashPasswordFromBcrypt;
        await user.save();
        resolve(user);
      } else {
        resolve(null);
      }
    } catch (e) {
      reject(e);
    }
  });
};

let checkUserPassword = (id, password) => {
  return new Promise(async (resolve, reject) => {
    try {
      let user = await db.User.findOne({
        where: { id: id },
        raw: true,
      });
      if (user) {
        let check = await bcrypt.compareSync(password, user.password_hash);
        resolve(check);
      } else {
        resolve(false);
      }
    } catch (e) {
      reject(e);
    }
  });
};

let handleForgotPassword = (email) => {
  return new Promise(async (resolve, reject) => {
    try {
      let userData = {};
      let isExist = await checkUserEmail(email);
      if (!isExist) {
        userData.errCode = 1;
        userData.errMessage = "Email not found in the system";
        resolve(userData);
        return;
      }

      // Generate 6-digit numeric code
      const resetCode = Math.floor(100000 + Math.random() * 900000).toString();

      // Set expiration to 30 minutes from now
      const expirationDate = new Date();
      expirationDate.setMinutes(expirationDate.getMinutes() + 30);

      // Update user with reset code and expiration
      let user = await db.User.findOne({
        where: { email: email },
      });

      if (user) {
        user.reset_code = resetCode;
        user.reset_code_expires = expirationDate;
        await user.save();

        // Send email with reset code
        try {
          await emailService.sendResetCodeEmail(email, resetCode);
          userData.errCode = 0;
          userData.errMessage = "Reset code sent to your email";
        } catch (emailError) {
          console.error("Email sending error:", emailError);
          userData.errCode = 2;
          userData.errMessage = `Failed to send email: ${emailError.message || "Please try again later."}`;
        }
      } else {
        userData.errCode = 1;
        userData.errMessage = "User not found";
      }

      resolve(userData);
    } catch (e) {
      reject(e);
    }
  });
};

let verifyResetCode = (email, code) => {
  return new Promise(async (resolve, reject) => {
    try {
      let result = {};
      let user = await db.User.findOne({
        where: { email: email },
        raw: true,
      });

      if (!user) {
        result.errCode = 1;
        result.errMessage = "Email not found";
        resolve(result);
        return;
      }

      if (!user.reset_code || !user.reset_code_expires) {
        result.errCode = 2;
        result.errMessage = "No reset code found. Please request a new one.";
        resolve(result);
        return;
      }

      // Check if code matches
      if (user.reset_code !== code) {
        result.errCode = 3;
        result.errMessage = "Invalid reset code";
        resolve(result);
        return;
      }

      // Check if code has expired
      const now = new Date();
      const expirationDate = new Date(user.reset_code_expires);
      if (now > expirationDate) {
        result.errCode = 4;
        result.errMessage = "Reset code has expired. Please request a new one.";
        resolve(result);
        return;
      }

      result.errCode = 0;
      result.errMessage = "Code verified successfully";
      resolve(result);
    } catch (e) {
      reject(e);
    }
  });
};

let resetPassword = (email, code, newPassword) => {
  return new Promise(async (resolve, reject) => {
    try {
      let result = {};

      // First verify the code
      let verifyResult = await verifyResetCode(email, code);
      if (verifyResult.errCode !== 0) {
        resolve(verifyResult);
        return;
      }

      // Code is valid, now reset the password
      let user = await db.User.findOne({
        where: { email: email },
      });

      if (user) {
        // Hash the new password
        let hashPasswordFromBcrypt = await bcrypt.hashSync(newPassword, 10);
        user.password_hash = hashPasswordFromBcrypt;
        // Clear reset code fields
        user.reset_code = null;
        user.reset_code_expires = null;
        await user.save();

        result.errCode = 0;
        result.errMessage = "Password reset successfully";
      } else {
        result.errCode = 1;
        result.errMessage = "User not found";
      }

      resolve(result);
    } catch (e) {
      reject(e);
    }
  });
};

module.exports = {
  handleUserLogin: handleUserLogin,
  getUsers: getUsers,
  deleteUser: deleteUser,
  hanbleUserRegister: hanbleUserRegister,
  updateUser: updateUser,
  updateUserPassword: updateUserPassword,
  checkUserPassword: checkUserPassword,
  getUserById: getUserById,
  handleForgotPassword: handleForgotPassword,
  verifyResetCode: verifyResetCode,
  resetPassword: resetPassword,
};
