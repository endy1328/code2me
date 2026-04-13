package com.example.legacy.web;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.RequestMapping;
import com.example.legacy.lib.AccountService;

@Controller
@RequestMapping("/account")
public class AccountController {
  private final AccountService accountService = new AccountService();

  @RequestMapping("/list.as")
  public String list() {
    accountService.loadAccounts();
    return "account/list";
  }
}
