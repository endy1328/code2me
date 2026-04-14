package com.example.web;

import com.example.service.AccountService;
import net.sourceforge.stripes.action.ActionBean;
import net.sourceforge.stripes.action.ActionBeanContext;
import net.sourceforge.stripes.action.DefaultHandler;
import net.sourceforge.stripes.action.ForwardResolution;
import net.sourceforge.stripes.action.HandlesEvent;
import net.sourceforge.stripes.action.Resolution;
import net.sourceforge.stripes.action.StreamingResolution;
import net.sourceforge.stripes.action.RedirectResolution;
import net.sourceforge.stripes.action.UrlBinding;

@UrlBinding("/account/list.action")
public class AccountActionBean implements ActionBean {
  private ActionBeanContext context;
  private AccountService accountService;

  @DefaultHandler
  public Resolution list() {
    accountService.loadAccounts();
    return new ForwardResolution("/WEB-INF/jsp/account/list.jsp");
  }

  @HandlesEvent("download")
  public Resolution download() {
    accountService.exportAccounts();
    return new StreamingResolution("text/csv", "id,name");
  }

  @HandlesEvent("refresh")
  public Resolution refresh() {
    accountService.loadAccounts();
    return new RedirectResolution(getClass());
  }

  @Override
  public ActionBeanContext getContext() {
    return context;
  }

  @Override
  public void setContext(ActionBeanContext context) {
    this.context = context;
  }
}
