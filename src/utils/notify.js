import { toast } from "sonner";

export const notify = {
  success: (msg) => toast.success(msg, { duration: 3500 }),
  error: (msg) => toast.error(msg, { duration: 4500 }),
  warning: (msg) => toast.warning(msg, { duration: 4000 }),
  info: (msg) => toast.info(msg, { duration: 3500 }),
  loading: (msg) => toast.loading(msg),
  dismiss: (id) => toast.dismiss(id),
  promise: (promise, msgs) => toast.promise(promise, msgs),
};

export default notify;
