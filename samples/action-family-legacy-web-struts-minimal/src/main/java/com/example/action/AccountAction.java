package com.example.action;

import com.example.service.AccountService;

public class AccountAction {
  private AccountService accountService;

  public String list() {
    accountService.loadAccounts();
    return "success";
  }

  public String download() {
    accountService.exportAccounts();
    return "success";
  }

  public String save() {
    accountService.loadAccounts();
    return "success";
  }
}
