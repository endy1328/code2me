package com.example.legacy.web;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.RequestMapping;

@Controller
@RequestMapping("/admin")
public class AdminOverviewController {
  @RequestMapping("/overview.do")
  public String overview() {
    return "admin/overview";
  }
}
