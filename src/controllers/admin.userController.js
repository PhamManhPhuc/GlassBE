import userService from "../services/userService.js";

const getAllUsers = async (_req, res) => {
  try {
    const users = await userService.getUsers();
    return res.status(200).json({ errCode: 0, message: "OK", data: users });
  } catch (error) {
    return res.status(500).json({
      errCode: 1,
      message: "Error getting users",
      error: error.message,
    });
  }
};

const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await userService.deleteUser(id);
    if (result.errCode === 1)
      return res.status(404).json({ errCode: 1, message: result.errMessage });
    if (result.errCode === 2)
      return res.status(403).json({ errCode: 2, message: result.errMessage });
    return res.status(200).json({ errCode: 0, message: result.errMessage });
  } catch (error) {
    return res.status(500).json({
      errCode: 1,
      message: "Error deleting user",
      error: error.message,
    });
  }
};

export default { getAllUsers, deleteUser };
