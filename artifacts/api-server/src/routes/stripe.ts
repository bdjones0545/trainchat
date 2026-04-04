import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/auth";
import { stripeService } from "../lib/stripeService";
import { stripeStorage } from "../lib/stripeStorage";
import { getUserPlanInfo, getPlanFeatures } from "../lib/planGating";

const router: IRouter = Router();

router.get("/subscription", requireAuth, async (req: any, res): Promise<void> => {
  try {
    const userId = req.session.userId!;
    const user = await stripeStorage.getUser(userId);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const planInfo = await getUserPlanInfo(userId);

    let subscription = null;
    if (user.stripeSubscriptionId) {
      subscription = await stripeStorage.getActiveSubscription(user.stripeSubscriptionId);

      if (subscription) {
        const plan = await stripeStorage.getSubscriptionPlan(user.stripeSubscriptionId);
        if (plan !== user.plan) {
          await stripeStorage.updateUserStripeInfo(userId, {
            plan,
            planStatus: String(subscription.status),
          });
          planInfo.plan = plan;
        }
      }
    }

    res.json({
      plan: planInfo.plan,
      planStatus: planInfo.planStatus,
      features: planInfo.features,
      messagesRemaining: planInfo.messagesRemaining,
      subscription,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/subscription/products", async (_req, res): Promise<void> => {
  try {
    const products = await stripeStorage.listProductsWithPrices();
    res.json({ products });
  } catch {
    res.json({ products: [] });
  }
});

router.post("/subscription/checkout", requireAuth, async (req: any, res): Promise<void> => {
  try {
    const userId = req.session.userId!;
    const { priceId } = req.body;

    if (!priceId) {
      res.status(400).json({ error: "priceId is required" });
      return;
    }

    const user = await stripeStorage.getUser(userId);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      customerId = await stripeService.createCustomer(user.email, userId);
      await stripeStorage.updateUserStripeInfo(userId, { stripeCustomerId: customerId });
    }

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const session = await stripeService.createCheckoutSession(
      customerId,
      priceId,
      `${baseUrl}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      `${baseUrl}/?checkout=cancel`
    );

    res.json({ url: session.url });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/subscription/confirm", requireAuth, async (req: any, res): Promise<void> => {
  try {
    const userId = req.session.userId!;
    const { sessionId } = req.body;
    if (!sessionId) {
      res.status(400).json({ error: "sessionId is required" });
      return;
    }

    const checkoutSession = await stripeService.getCheckoutSession(sessionId);
    if (!checkoutSession.subscription) {
      res.status(400).json({ error: "No subscription on checkout session" });
      return;
    }

    const subscriptionId =
      typeof checkoutSession.subscription === "string"
        ? checkoutSession.subscription
        : checkoutSession.subscription.id;

    const plan = await stripeStorage.getSubscriptionPlan(subscriptionId);

    await stripeStorage.updateUserStripeInfo(userId, {
      stripeSubscriptionId: subscriptionId,
      plan,
      planStatus: "active",
    });

    const features = getPlanFeatures(plan);
    res.json({ plan, features, subscriptionId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/subscription/portal", requireAuth, async (req: any, res): Promise<void> => {
  try {
    const userId = req.session.userId!;
    const user = await stripeStorage.getUser(userId);

    if (!user?.stripeCustomerId) {
      res.status(400).json({ error: "No billing account found. Please subscribe first." });
      return;
    }

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const portalSession = await stripeService.createPortalSession(
      user.stripeCustomerId,
      `${baseUrl}/`
    );

    res.json({ url: portalSession.url });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
