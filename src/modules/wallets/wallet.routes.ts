import { Router } from "express";
import { validate } from "../../middlewares/validate";
import { topUpSchema, bonusSchema, spendSchema } from "./wallet.schema";
import {
  handleTopUp,
  handleBonus,
  handleSpend,
  handleGetBalance,
} from "./wallet.controller";

const router: Router = Router();

router.post("/top-up", validate(topUpSchema), handleTopUp);
router.post("/bonus", validate(bonusSchema), handleBonus);
router.post("/spend", validate(spendSchema), handleSpend);
router.get("/:userId", handleGetBalance);

export { router as walletRouter };
